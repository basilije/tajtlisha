import { mkdtemp, rm, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import type { ExportOverwritePolicy, ExportProjectRequest, ExportProjectResult } from '../../shared/types/export';
import type { SubtitleTrack, TranscriptSegment } from '../../shared/types/subtitles';
import { MediaService } from '../media';
import { validatePath, validateTimeRange } from '../media/contracts';
import { SubtitleBurnService } from './burn-subtitles';
import { buildCopyFilename, buildExportFilename } from './filenames';
import { writeSrt } from './srt';

export class ProjectExportService {
  constructor(
    private readonly mediaService: Pick<MediaService, 'trim'> = new MediaService(),
    private readonly subtitleBurnService: Pick<SubtitleBurnService, 'burnSubtitles'> = new SubtitleBurnService()
  ) {}

  async exportProject(input: ExportProjectRequest): Promise<ExportProjectResult> {
    validatePath(input.inputPath, 'inputPath');
    validatePath(input.outputFolder, 'outputFolder');
    await assertOutputFolder(input.outputFolder);

    const trim = normalizeTrim(input.trim);
    const tracks = trim ? input.tracks.map((track) => trimTrack(track, trim.startMs, trim.endMs)) : input.tracks;
    const originalTrack = tracks.find((track) => track.kind === 'original');
    const translationTrack = tracks.find((track) => track.kind === 'translation');
    const burnedTrack = tracks.find((track) => track.kind === input.burnedInTrack) ?? translationTrack ?? originalTrack;
    const plannedOutputs = buildPlannedOutputs(input, originalTrack, translationTrack, burnedTrack);
    assertOutputPathsStayInFolder(input.outputFolder, plannedOutputs);
    const outputs = await resolveOutputPaths(plannedOutputs, input.overwritePolicy ?? 'ask');
    const result: ExportProjectResult = {};

    if (outputs.originalSrtPath && originalTrack) {
      result.originalSrtPath = outputs.originalSrtPath;
      await writeSrt({
        outputPath: result.originalSrtPath,
        track: originalTrack,
        overwriteExisting: input.overwritePolicy === 'overwrite'
      });
    }

    if (outputs.translatedSrtPath && translationTrack) {
      result.translatedSrtPath = outputs.translatedSrtPath;
      await writeSrt({
        outputPath: result.translatedSrtPath,
        track: translationTrack,
        overwriteExisting: input.overwritePolicy === 'overwrite'
      });
    }

    if (!burnedTrack || !outputs.burnedInVideoPath) {
      return result;
    }

    result.burnedInVideoPath = outputs.burnedInVideoPath;
    const overwriteExisting = input.overwritePolicy === 'overwrite';

    if (!trim) {
      await this.subtitleBurnService.burnSubtitles({
        inputPath: input.inputPath,
        outputPath: result.burnedInVideoPath,
        track: burnedTrack,
        style: input.style,
        overwriteExisting
      });
      return result;
    }

    const tempDir = await mkdtemp(join(tmpdir(), 'tajtlisha-export-'));
    const trimmedInputPath = join(tempDir, 'trimmed.mp4');
    try {
      await this.mediaService.trim({
        inputPath: input.inputPath,
        outputPath: trimmedInputPath,
        startMs: trim.startMs,
        endMs: trim.endMs,
        knownDurationMs: trim.knownDurationMs
      });
      await this.subtitleBurnService.burnSubtitles({
        inputPath: trimmedInputPath,
        outputPath: result.burnedInVideoPath,
        track: burnedTrack,
        style: input.style,
        overwriteExisting
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }

    return result;
  }
}

type PlannedOutputKind = keyof ExportProjectResult;

type PlannedOutput = {
  kind: PlannedOutputKind;
  path: string;
};

type OutputPaths = ExportProjectResult;

export class ExportOutputConflictError extends Error {
  readonly code = 'EXPORT_OUTPUT_CONFLICT';
  readonly paths: string[];

  constructor(paths: string[]) {
    super(`Export would replace existing or duplicate output files: ${paths.join(', ')}`);
    this.name = 'ExportOutputConflictError';
    this.paths = paths;
  }
}

function buildPlannedOutputs(
  input: ExportProjectRequest,
  originalTrack: SubtitleTrack | undefined,
  translationTrack: SubtitleTrack | undefined,
  burnedTrack: SubtitleTrack | undefined
): PlannedOutput[] {
  const outputs: PlannedOutput[] = [];
  if (input.exportOriginalSrt && originalTrack) {
    outputs.push({
      kind: 'originalSrtPath',
      path: buildExportFilename({
        inputPath: input.inputPath,
        outputFolder: input.outputFolder,
        track: originalTrack,
        extension: 'srt',
        pattern: input.fileNamePattern
      })
    });
  }
  if (input.exportTranslatedSrt && translationTrack) {
    outputs.push({
      kind: 'translatedSrtPath',
      path: buildExportFilename({
        inputPath: input.inputPath,
        outputFolder: input.outputFolder,
        track: translationTrack,
        extension: 'srt',
        pattern: input.fileNamePattern
      })
    });
  }
  if (burnedTrack) {
    outputs.push({
      kind: 'burnedInVideoPath',
      path: buildExportFilename({
        inputPath: input.inputPath,
        outputFolder: input.outputFolder,
        track: burnedTrack,
        extension: 'mp4',
        pattern: `${input.fileNamePattern ?? '{name}.{track}'}.burned`
      })
    });
  }

  return outputs;
}

async function resolveOutputPaths(outputs: PlannedOutput[], policy: ExportOverwritePolicy): Promise<OutputPaths> {
  const resolved: OutputPaths = {};
  const reserved = new Set<string>();
  const conflicts: string[] = [];

  for (const output of outputs) {
    let outputPath = output.path;
    const hasDuplicate = reserved.has(outputPath);

    if (policy === 'create_copy') {
      let copyIndex = 1;
      while (reserved.has(outputPath) || (await pathExists(outputPath))) {
        outputPath = buildCopyFilename(output.path, copyIndex++);
      }
    } else if (hasDuplicate || (policy === 'ask' && (await pathExists(outputPath)))) {
      conflicts.push(outputPath);
    }

    reserved.add(outputPath);
    resolved[output.kind] = outputPath;
  }

  if (conflicts.length > 0) {
    throw new ExportOutputConflictError([...new Set(conflicts)]);
  }

  return resolved;
}

function assertOutputPathsStayInFolder(outputFolder: string, outputs: PlannedOutput[]): void {
  const resolvedFolder = resolve(outputFolder);
  for (const output of outputs) {
    const outputRelativePath = relative(resolvedFolder, resolve(output.path));
    if (outputRelativePath === '..' || outputRelativePath.startsWith(`..${sep}`) || isAbsolute(outputRelativePath)) {
      throw new Error('fileNamePattern must produce files inside outputFolder.');
    }
  }
}

async function assertOutputFolder(outputFolder: string): Promise<void> {
  let folderStat: Awaited<ReturnType<typeof stat>>;
  try {
    folderStat = await stat(outputFolder);
  } catch {
    throw new Error('outputFolder must be an existing directory.');
  }

  if (!folderStat.isDirectory()) {
    throw new Error('outputFolder must be a directory.');
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

type NormalizedTrim = {
  startMs: number;
  endMs: number;
  knownDurationMs?: number;
};

function normalizeTrim(trim: ExportProjectRequest['trim']): NormalizedTrim | undefined {
  if (!trim || trim.startMs === 0) {
    if (!trim || trim.endMs === 0 || trim.endMs === trim.knownDurationMs) {
      return undefined;
    }
  }

  validateTimeRange(trim.startMs, trim.endMs, trim.knownDurationMs);
  return trim;
}

function trimTrack(track: SubtitleTrack, trimStartMs: number, trimEndMs: number): SubtitleTrack {
  return {
    ...track,
    segments: track.segments
      .map((segment) => trimSegment(segment, trimStartMs, trimEndMs))
      .filter((segment): segment is TranscriptSegment => Boolean(segment))
  };
}

function trimSegment(segment: TranscriptSegment, trimStartMs: number, trimEndMs: number): TranscriptSegment | undefined {
  const startMs = Math.max(segment.startMs, trimStartMs);
  const endMs = Math.min(segment.endMs, trimEndMs);

  if (endMs <= startMs) {
    return undefined;
  }

  return {
    ...segment,
    startMs: startMs - trimStartMs,
    endMs: endMs - trimStartMs
  };
}
