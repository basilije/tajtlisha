/* @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { link, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { AppError } from '../../../src/shared/errors';
import { DEFAULT_SUBTITLE_STYLE } from '../../../src/shared/subtitle-geometry';
import type { ProjectExportRequest } from '../../../src/shared/types/jobs';
import type { CaptionRow } from '../../../src/shared/types/project';
import type { MediaProbeRequest, MediaProbeResult } from '../../../src/shared/types/media';
import type { FfmpegRunOptions } from '../../../src/main/ffmpeg/ffmpeg-service';
import { type ExportFileOps, ProjectExportService } from '../../../src/main/export';

type FfmpegScenario = (args: string[], options: FfmpegRunOptions) => Promise<void>;

/** Fake ffmpeg: records calls and runs the scenario, which decides what (if anything) is written. */
function fakeFfmpeg(scenario: FfmpegScenario = writeVideo('default')) {
  const calls: string[][] = [];
  const service = {
    run: async (args: string[], options: FfmpegRunOptions = {}) => {
      calls.push(args);
      await scenario(args, options);
      return { stdout: '', stderr: '' };
    }
  };
  return { service, calls };
}

function writeVideo(label: string): FfmpegScenario {
  return async (args) => {
    await writeFile(args[args.length - 1], `video ${label}`, 'utf8');
  };
}

/** Like writeVideo, but slow enough that two exports overlap if nothing serializes them. */
function slowVideo(label: string): FfmpegScenario {
  return async (args) => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    await writeVideo(label)(args, {});
  };
}

function fakeProbe(): (input: MediaProbeRequest) => Promise<MediaProbeResult> {
  return async (input) => ({ inputPath: input.inputPath, hasVideo: true, hasAudio: true, durationMs: 4000, width: 720, height: 1280 });
}

function captionsFor(label: string): CaptionRow[] {
  return [
    { id: 'a', startMs: 1200, endMs: 1800, original: `Line ${label}`, translation: `Linija ${label}` },
    { id: 'b', startMs: 2100, endMs: 2500, original: `Second ${label}`, translation: `Druga ${label}` }
  ];
}

async function setup(overrides: Partial<ProjectExportRequest> = {}) {
  const folder = await mkdtemp(join(tmpdir(), 'tajtlisha-export-staging-test-'));
  await writeFile(join(folder, 'source.mp4'), 'source video');
  const request: ProjectExportRequest = {
    jobId: 'job-staging',
    inputPath: join(folder, 'source.mp4'),
    outputFolder: folder,
    baseName: 'clip',
    videoWidth: 720,
    videoHeight: 1280,
    trim: { startMs: 1000, endMs: 3000 },
    captions: captionsFor('X'),
    sourceLanguage: 'en',
    targetLanguage: 'sr-Latn',
    style: DEFAULT_SUBTITLE_STYLE,
    outputs: { originalSrt: true, translationSrt: true, video: 'none' },
    overwritePolicy: 'ask',
    ...overrides
  };
  return { folder, request };
}

function serviceWith(ffmpeg: ReturnType<typeof fakeFfmpeg>['service'], fileOps?: Partial<ExportFileOps>): ProjectExportService {
  return new ProjectExportService({ ffmpeg, fontsDir: '/fonts', probe: fakeProbe(), fileOps });
}

async function expectAppError(promise: Promise<unknown>, code: string): Promise<AppError> {
  const error = await promise.then(
    () => {
      throw new Error(`Expected ${code}`);
    },
    (caught: unknown) => caught
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  return error as AppError;
}

async function listing(folder: string): Promise<string[]> {
  return (await readdir(folder)).sort();
}

describe('export staging: concurrency', () => {
  it('keeps concurrent create_copy exports to one folder apart, each listing its own files', async () => {
    const { folder, request } = await setup({ overwritePolicy: 'create_copy', outputs: { originalSrt: true, translationSrt: true, video: 'original' } });
    const exportA = fakeFfmpeg(slowVideo('A'));
    const exportB = fakeFfmpeg(slowVideo('B'));

    try {
      const [a, b] = await Promise.all([
        serviceWith(exportA.service).exportProject({ ...request, captions: captionsFor('A') }),
        serviceWith(exportB.service).exportProject({ ...request, captions: captionsFor('B') })
      ]);

      const aPaths = a.files.map((file) => file.path);
      const bPaths = b.files.map((file) => file.path);
      expect(new Set([...aPaths, ...bPaths]).size).toBe(6);
      expect(await listing(folder)).toHaveLength(7);
      expect((await listing(folder)).some((name) => name.startsWith('.tajtlisha-export-'))).toBe(false);

      for (const [files, label, other] of [
        [a.files, 'A', 'B'],
        [b.files, 'B', 'A']
      ] as const) {
        for (const file of files) {
          const content = await readFile(file.path, 'utf8');
          if (file.kind === 'video') {
            expect(content).toBe(`video ${label}`);
            continue;
          }
          const expected = file.kind === 'original_srt' ? `Line ${label}` : `Linija ${label}`;
          expect(content).toContain(expected);
          expect(content).not.toContain(`Line ${other}`);
          expect(content).not.toContain(`Linija ${other}`);
        }
      }
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});

describe('export staging: destinations', () => {
  it('leaves the source untouched when a symlink at an SRT destination points at it', async () => {
    const { folder, request } = await setup({ overwritePolicy: 'overwrite', outputs: { originalSrt: true, translationSrt: false, video: 'none' } });
    await symlink(join(folder, 'source.mp4'), join(folder, 'clip.en.srt'));
    const ffmpeg = fakeFfmpeg();

    try {
      await expectAppError(serviceWith(ffmpeg.service).exportProject(request), 'OUTPUT_IS_SOURCE');
      expect(await readFile(join(folder, 'source.mp4'), 'utf8')).toBe('source video');
      expect(ffmpeg.calls).toHaveLength(0);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('leaves the source untouched when a symlink at the video destination points at it', async () => {
    const { folder, request } = await setup({ overwritePolicy: 'overwrite', outputs: { originalSrt: false, translationSrt: false, video: 'original' } });
    await symlink(join(folder, 'source.mp4'), join(folder, 'clip.subtitled.mp4'));
    const ffmpeg = fakeFfmpeg();

    try {
      await expectAppError(serviceWith(ffmpeg.service).exportProject(request), 'OUTPUT_IS_SOURCE');
      expect(await readFile(join(folder, 'source.mp4'), 'utf8')).toBe('source video');
      expect(ffmpeg.calls).toHaveLength(0);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('refuses a symlink to a file outside the folder without writing through it', async () => {
    const { folder, request } = await setup({ overwritePolicy: 'overwrite', outputs: { originalSrt: true, translationSrt: false, video: 'none' } });
    const outsideFolder = await mkdtemp(join(tmpdir(), 'tajtlisha-export-staging-outside-'));
    const outside = join(outsideFolder, 'outside.srt');
    await writeFile(outside, 'outside', 'utf8');
    await symlink(outside, join(folder, 'clip.en.srt'));

    try {
      await expectAppError(serviceWith(fakeFfmpeg().service).exportProject(request), 'OUTPUT_FOLDER_INVALID');
      expect(await readFile(outside, 'utf8')).toBe('outside');
    } finally {
      await rm(folder, { recursive: true, force: true });
      await rm(outsideFolder, { recursive: true, force: true });
    }
  });

  it('ignores a symlink planted at the old predictable temp name', async () => {
    const { folder, request } = await setup({ overwritePolicy: 'overwrite', outputs: { originalSrt: true, translationSrt: true, video: 'original' } });
    await symlink(join(folder, 'source.mp4'), join(folder, '.clip.subtitled.mp4.tajtlisha-tmp'));
    await symlink(join(folder, 'source.mp4'), join(folder, '.clip.en.srt.tajtlisha-tmp'));

    try {
      const result = await serviceWith(fakeFfmpeg(writeVideo('planted')).service).exportProject(request);
      expect(result.files).toHaveLength(3);
      expect(await readFile(join(folder, 'source.mp4'), 'utf8')).toBe('source video');
      expect(await readFile(join(folder, 'clip.subtitled.mp4'), 'utf8')).toBe('video planted');
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('fails before rendering when a directory occupies a destination, and keeps the existing SRT', async () => {
    const { folder, request } = await setup({ overwritePolicy: 'overwrite', outputs: { originalSrt: true, translationSrt: true, video: 'original' } });
    await writeFile(join(folder, 'clip.en.srt'), 'original srt', 'utf8');
    await mkdir(join(folder, 'clip.sr-Latn.srt'));
    const ffmpeg = fakeFfmpeg();

    try {
      await expectAppError(serviceWith(ffmpeg.service).exportProject(request), 'OUTPUT_FOLDER_INVALID');
      expect(ffmpeg.calls).toHaveLength(0);
      expect(await readFile(join(folder, 'clip.en.srt'), 'utf8')).toBe('original srt');
      expect(await listing(folder)).toEqual(['clip.en.srt', 'clip.sr-Latn.srt', 'source.mp4']);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});

describe('export staging: publication', () => {
  it('restores every previous file byte for byte when overwrite fails on the second rename', async () => {
    const { folder, request } = await setup({ overwritePolicy: 'overwrite' });
    const oldOriginal = Buffer.from([0, 255, 1, 2, 3]);
    const oldTranslation = Buffer.from('old translation', 'utf8');
    await writeFile(join(folder, 'clip.en.srt'), oldOriginal);
    await writeFile(join(folder, 'clip.sr-Latn.srt'), oldTranslation);

    // Fails once, on the publication rename of the second file. Rollback uses the same hook and must still succeed.
    let failed = false;
    const fileOps: Partial<ExportFileOps> = {
      rename: async (from, to) => {
        if (!failed && basename(to) === 'clip.sr-Latn.srt') {
          failed = true;
          throw new Error('injected rename failure');
        }
        await rename(from, to);
      }
    };

    try {
      await expect(serviceWith(fakeFfmpeg().service, fileOps).exportProject(request)).rejects.toThrow('injected rename failure');
      expect(Buffer.compare(await readFile(join(folder, 'clip.en.srt')), oldOriginal)).toBe(0);
      expect(Buffer.compare(await readFile(join(folder, 'clip.sr-Latn.srt')), oldTranslation)).toBe(0);
      expect(await listing(folder)).toEqual(['clip.en.srt', 'clip.sr-Latn.srt', 'source.mp4']);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('removes the linked files of a failed ask-publication and leaves nothing behind', async () => {
    const { folder, request } = await setup();
    let calls = 0;
    const fileOps: Partial<ExportFileOps> = {
      link: async (existingPath, newPath) => {
        calls += 1;
        if (calls === 2) {
          throw Object.assign(new Error('EIO: injected link failure'), { code: 'EIO' });
        }
        await link(existingPath, newPath);
      }
    };

    try {
      await expect(serviceWith(fakeFfmpeg().service, fileOps).exportProject(request)).rejects.toThrow('injected link failure');
      expect(await listing(folder)).toEqual(['source.mp4']);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('publishes through rename when hard links are not supported', async () => {
    const { folder, request } = await setup({ outputs: { originalSrt: true, translationSrt: true, video: 'original' } });
    const fileOps: Partial<ExportFileOps> = {
      link: async () => {
        throw Object.assign(new Error('EPERM: links not supported'), { code: 'EPERM' });
      }
    };

    try {
      const result = await serviceWith(fakeFfmpeg(writeVideo('renamed')).service, fileOps).exportProject(request);
      expect(result.files.map((file) => file.path)).toEqual([
        join(folder, 'clip.en.srt'),
        join(folder, 'clip.sr-Latn.srt'),
        join(folder, 'clip.subtitled.mp4')
      ]);
      expect(await readFile(join(folder, 'clip.subtitled.mp4'), 'utf8')).toBe('video renamed');
      expect(await listing(folder)).toEqual(['clip.en.srt', 'clip.sr-Latn.srt', 'clip.subtitled.mp4', 'source.mp4']);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('asks with OUTPUT_EXISTS and changes nothing when a planned file exists', async () => {
    const { folder, request } = await setup();
    await writeFile(join(folder, 'clip.en.srt'), 'keep me', 'utf8');
    const ffmpeg = fakeFfmpeg();

    try {
      await expectAppError(serviceWith(ffmpeg.service).exportProject(request), 'OUTPUT_EXISTS');
      expect(await readFile(join(folder, 'clip.en.srt'), 'utf8')).toBe('keep me');
      expect(await listing(folder)).toEqual(['clip.en.srt', 'source.mp4']);
      expect(ffmpeg.calls).toHaveLength(0);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('removes the staging folder after a successful export', async () => {
    const { folder, request } = await setup({ outputs: { originalSrt: true, translationSrt: true, video: 'original' } });

    try {
      await serviceWith(fakeFfmpeg(writeVideo('ok')).service).exportProject(request);
      expect(await listing(folder)).toEqual(['clip.en.srt', 'clip.sr-Latn.srt', 'clip.subtitled.mp4', 'source.mp4']);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});

describe('export staging: cancel', () => {
  it('cancels during render with no outputs, keeps the previous file, and removes the staging folder', async () => {
    const { folder, request } = await setup({ overwritePolicy: 'overwrite', outputs: { originalSrt: true, translationSrt: false, video: 'original' } });
    await writeFile(join(folder, 'clip.en.srt'), 'old', 'utf8');
    const controller = new AbortController();
    const ffmpeg = fakeFfmpeg(async (args) => {
      await writeFile(args[args.length - 1], 'partial', 'utf8');
      controller.abort();
      throw new AppError('JOB_CANCELED');
    });

    try {
      await expectAppError(serviceWith(ffmpeg.service).exportProject(request, { signal: controller.signal }), 'JOB_CANCELED');
      expect(await readFile(join(folder, 'clip.en.srt'), 'utf8')).toBe('old');
      expect(await listing(folder)).toEqual(['clip.en.srt', 'source.mp4']);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
