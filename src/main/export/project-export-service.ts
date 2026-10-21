import { access, mkdtemp, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { AppError } from '../../shared/errors';
import { clamp } from '../../shared/subtitle-geometry';
import type { JobStage, ProjectExportRequest, ProjectExportResult, ExportedFileKind } from '../../shared/types/jobs';
import type { TrimRange } from '../../shared/types/project';
import { FfmpegService } from '../ffmpeg';
import { buildAssDocument } from './ass';
import { type CaptionTextField, type ExportCaption, captionCuesFor, hasText, toExportCaptions } from './captions';
import { buildCopyFilename, sanitizeFilePart } from './filenames';
import { buildSrtFromCaptions } from './srt';
import { validateSubtitleTiming } from './timing';

export type ProjectExportProgress = {
  stage: JobStage;
  /** 0..1 when known. */
  progress?: number;
};

export type ProjectExportContext = {
  signal?: AbortSignal;
  onProgress?: (event: ProjectExportProgress) => void;
};

export type ProjectExportServiceOptions = {
  /** Defaults to the system `ffmpeg`. */
  ffmpeg?: Pick<FfmpegService, 'run'>;
  /** Directory with the bundled Noto Sans fonts, passed to libass as fontsdir. */
  fontsDir: string;
};

type PlannedOutput = {
  kind: ExportedFileKind;
  path: string;
};

type PendingOutput = PlannedOutput & {
  tempPath: string;
};

/**
 * Renders the trimmed MP4 (burned-in ASS) and the SRT files for one project.
 * Everything is written to temp files first and renamed at the end, so a
 * failed or canceled export leaves no partial outputs behind.
 */
export class ProjectExportService {
  private readonly ffmpeg: Pick<FfmpegService, 'run'>;
  private readonly fontsDir: string;

  constructor(options: ProjectExportServiceOptions) {
    this.ffmpeg = options.ffmpeg ?? new FfmpegService();
    this.fontsDir = options.fontsDir;
  }

  async exportProject(request: ProjectExportRequest, context: ProjectExportContext = {}): Promise<ProjectExportResult> {
    const { signal, onProgress } = context;
    const captions = await validateRequest(request);
    const planned = planOutputPaths(request, resolve(request.outputFolder));
    await assertNoPlannedCollisions(planned);
    await assertNoSourceOverwrite(request.inputPath, planned);
    const finalOutputs = await applyOverwritePolicy(planned, request.overwritePolicy);
    await assertNoSourceOverwrite(request.inputPath, finalOutputs);
    throwIfCanceled(signal);

    const pending: PendingOutput[] = finalOutputs.map((output) => ({ ...output, tempPath: tempPathFor(output.path) }));
    const renamed: string[] = [];

    try {
      const videoOutput = pending.find((output) => output.kind === 'video');
      if (videoOutput) {
        await this.renderVideo({ request, captions, outputPath: videoOutput.tempPath, signal, onProgress });
      }

      const srtOutputs = pending.filter((output) => output.kind !== 'video');
      if (srtOutputs.length > 0) {
        onProgress?.({ stage: 'writing_srt' });
      }
      for (const output of srtOutputs) {
        throwIfCanceled(signal);
        const field: CaptionTextField = output.kind === 'original_srt' ? 'original' : 'translation';
        await writeFile(output.tempPath, buildSrtFromCaptions(captions, field), 'utf8');
      }

      throwIfCanceled(signal);
      if (request.overwritePolicy !== 'overwrite') {
        // Re-check right before the rename: another program may have created a file since planning.
        const late = await existingPaths(finalOutputs);
        if (late.length > 0) {
          throw new AppError('OUTPUT_EXISTS', late.join('\n'));
        }
      }

      for (const output of pending) {
        await rename(output.tempPath, output.path);
        renamed.push(output.path);
      }
    } catch (error) {
      // Rename failures are rare. Finished files are removed too, so no partial bundle remains.
      await removeFiles([...pending.map((output) => output.tempPath), ...renamed]);
      throw error;
    }

    return {
      files: pending.map((output) => ({ kind: output.kind, path: output.path }))
    };
  }

  private async renderVideo(input: {
    request: ProjectExportRequest;
    captions: ExportCaption[];
    outputPath: string;
    signal?: AbortSignal;
    onProgress?: ProjectExportContext['onProgress'];
  }): Promise<void> {
    const { request, captions, outputPath, signal, onProgress } = input;
    const durationMs = request.trim.endMs - request.trim.startMs;
    const field: CaptionTextField = request.outputs.video === 'translation' ? 'translation' : 'original';

    const assDir = await mkdtemp(join(tmpdir(), 'tajtlisha-ass-'));
    try {
      const assPath = join(assDir, 'subtitles.ass');
      const assDocument = buildAssDocument({
        captions: captionCuesFor(captions, field),
        style: request.style,
        videoWidth: request.videoWidth,
        videoHeight: request.videoHeight
      });
      await writeFile(assPath, assDocument, 'utf8');

      onProgress?.({ stage: 'rendering_video', progress: 0 });
      await this.ffmpeg.run(
        buildVideoArgs({
          inputPath: request.inputPath,
          outputPath,
          assPath,
          fontsDir: this.fontsDir,
          startMs: request.trim.startMs,
          durationMs
        }),
        {
          signal,
          onProgress: (outTimeMs) => onProgress?.({ stage: 'rendering_video', progress: clamp(outTimeMs / durationMs, 0, 1) })
        }
      );
      throwIfCanceled(signal);
    } finally {
      await rm(assDir, { recursive: true, force: true });
    }
  }
}

/**
 * Runs every check that must pass before a single byte is written, and returns
 * the captions on the exported timeline.
 */
async function validateRequest(request: ProjectExportRequest): Promise<ExportCaption[]> {
  const { outputs, trim } = request;
  if (!outputs.originalSrt && !outputs.translationSrt && outputs.video === 'none') {
    throw new AppError('NOTHING_TO_EXPORT');
  }

  assertValidTrim(trim);

  const { baseName } = request;
  if (baseName.trim().length === 0 || /[/\\]/.test(baseName) || baseName === '.' || baseName === '..') {
    throw new AppError('OUTPUT_FOLDER_INVALID', 'Export file name is empty or contains a path separator.');
  }

  await assertDirectory(request.outputFolder);
  await assertSourceExists(request.inputPath);

  const captions = toExportCaptions(request.captions, trim);
  const issues = validateSubtitleTiming(captions);
  if (issues.length > 0) {
    throw new AppError('INVALID_TIMING', issues.map((issue) => `${issue.cueId} (${issue.code})`).join(', '));
  }

  if (outputs.translationSrt || outputs.video === 'translation') {
    const incomplete = captions.filter((caption) => hasText(caption.original) && !hasText(caption.translation)).length;
    if (incomplete > 0) {
      throw new AppError('TRANSLATION_INCOMPLETE', `${incomplete} caption(s) have no translation yet.`);
    }
  }

  return captions;
}

function assertValidTrim(trim: TrimRange): void {
  const valid = Number.isFinite(trim.startMs) && Number.isFinite(trim.endMs) && trim.startMs >= 0 && trim.endMs > trim.startMs;
  if (!valid) {
    throw new AppError('INVALID_TRIM', `Trim range ${trim.startMs}..${trim.endMs} ms is not valid.`);
  }
}

async function assertDirectory(folder: string): Promise<void> {
  let folderStat: Awaited<ReturnType<typeof stat>>;
  try {
    folderStat = await stat(folder);
  } catch {
    throw new AppError('OUTPUT_FOLDER_INVALID', 'Output folder does not exist.');
  }

  if (!folderStat.isDirectory()) {
    throw new AppError('OUTPUT_FOLDER_INVALID', 'Output folder is not a directory.');
  }
}

async function assertSourceExists(inputPath: string): Promise<void> {
  try {
    await access(inputPath);
  } catch {
    throw new AppError('SOURCE_MISSING', inputPath);
  }
}

function planOutputPaths(request: ProjectExportRequest, folder: string): PlannedOutput[] {
  const { baseName, outputs } = request;
  const planned: PlannedOutput[] = [];

  if (outputs.originalSrt) {
    planned.push({ kind: 'original_srt', path: join(folder, `${baseName}.${languageTag(request.sourceLanguage)}.srt`) });
  }
  if (outputs.translationSrt) {
    planned.push({ kind: 'translation_srt', path: join(folder, `${baseName}.${languageTag(request.targetLanguage)}.srt`) });
  }
  if (outputs.video !== 'none') {
    planned.push({ kind: 'video', path: join(folder, `${baseName}.subtitled.mp4`) });
  }

  return planned;
}

function languageTag(language: string): string {
  return sanitizeFilePart(language) || 'und';
}

/** Source and target languages can be equal, which would give two SRTs the same name. */
async function assertNoPlannedCollisions(planned: PlannedOutput[]): Promise<void> {
  const seen = new Set<string>();
  for (const output of planned) {
    const key = output.path.toLowerCase();
    if (seen.has(key)) {
      throw new AppError('OUTPUT_FOLDER_INVALID', `Two exported files would have the same name: ${basename(output.path)}.`);
    }
    seen.add(key);
  }
}

/** Refuses any planned output that resolves to the source video, following symlinks when the file exists. */
async function assertNoSourceOverwrite(inputPath: string, planned: PlannedOutput[]): Promise<void> {
  const source = await canonicalPath(inputPath);
  for (const output of planned) {
    if ((await canonicalPath(output.path)) === source) {
      throw new AppError('OUTPUT_IS_SOURCE', output.path);
    }
  }
}

async function applyOverwritePolicy(planned: PlannedOutput[], policy: ProjectExportRequest['overwritePolicy']): Promise<PlannedOutput[]> {
  const existing = await existingPaths(planned);
  if (existing.length === 0 || policy === 'overwrite') {
    return planned;
  }

  if (policy === 'ask') {
    throw new AppError('OUTPUT_EXISTS', existing.join('\n'));
  }

  // create_copy: one copy number for the whole bundle, so the SRTs and the MP4 stay paired.
  for (let copyIndex = 1; ; copyIndex += 1) {
    const candidates = planned.map((output) => ({ kind: output.kind, path: buildCopyFilename(output.path, copyIndex) }));
    if ((await existingPaths(candidates)).length === 0) {
      return candidates;
    }
  }
}

async function existingPaths(outputs: PlannedOutput[]): Promise<string[]> {
  const found: string[] = [];
  for (const output of outputs) {
    if (await pathExists(output.path)) {
      found.push(output.path);
    }
  }
  return found;
}

function buildVideoArgs(input: {
  inputPath: string;
  outputPath: string;
  assPath: string;
  fontsDir: string;
  startMs: number;
  durationMs: number;
}): string[] {
  return [
    '-y',
    '-ss',
    formatSeconds(input.startMs),
    '-i',
    input.inputPath,
    '-t',
    formatSeconds(input.durationMs),
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-vf',
    `ass=filename=${escapeFilterValue(input.assPath)}:fontsdir=${escapeFilterValue(input.fontsDir)}`,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    // The temp name ends in .tajtlisha-tmp, so the muxer has to be named explicitly.
    '-f',
    'mp4',
    input.outputPath
  ];
}

function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

/**
 * Escapes a value for an ffmpeg filter option. Each special character gets three
 * backslashes: the filtergraph parser consumes one level and the filter's option
 * parser reads the next. Quoting alone broke on paths with quotes or colons.
 */
export function escapeFilterValue(value: string): string {
  return value.replace(/[\\':,[\];]/g, (char) => `\\\\\\${char}`);
}

function tempPathFor(outputPath: string): string {
  return join(dirname(outputPath), `.${basename(outputPath)}.tajtlisha-tmp`);
}

function throwIfCanceled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new AppError('JOB_CANCELED');
  }
}

async function removeFiles(paths: string[]): Promise<void> {
  await Promise.all(paths.map((path) => rm(path, { force: true })));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Resolves symlinks for existing files, and for missing files via their folder. */
async function canonicalPath(path: string): Promise<string> {
  const absolute = resolve(path);
  try {
    return await realpath(absolute);
  } catch {
    try {
      return join(await realpath(dirname(absolute)), basename(absolute));
    } catch {
      return absolute;
    }
  }
}
