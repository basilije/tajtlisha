/* @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppError } from '../../../src/shared/errors';
import { DEFAULT_SUBTITLE_STYLE } from '../../../src/shared/subtitle-geometry';
import type { ProjectExportRequest } from '../../../src/shared/types/jobs';
import type { CaptionRow } from '../../../src/shared/types/project';
import type { FfmpegRunOptions } from '../../../src/main/ffmpeg/ffmpeg-service';
import { ProjectExportService, buildCopyFilename, escapeFilterValue, formatSrtTimestamp, serializeSrt, validateSubtitleTiming } from '../../../src/main/export';
import type { SubtitleTrack } from '../../../src/shared/types/subtitles';

type FakeRun = (args: string[], options: FfmpegRunOptions) => Promise<{ stdout: string; stderr: string }>;

/** Fake ffmpeg: records calls, writes the output file, and runs the scenario hook. */
function fakeFfmpeg(scenario: FakeRun = writeOutput) {
  const calls: Array<{ args: string[]; assDocument?: string }> = [];
  const service = {
    run: async (args: string[], options: FfmpegRunOptions = {}) => {
      const assPath = assPathFrom(args);
      const call: { args: string[]; assDocument?: string } = { args };
      if (assPath) {
        call.assDocument = await readFile(assPath, 'utf8');
      }
      calls.push(call);
      return scenario(args, options);
    }
  };
  return { service, calls };
}

async function writeOutput(args: string[]): Promise<{ stdout: string; stderr: string }> {
  await writeFile(args[args.length - 1], 'fake mp4', 'utf8');
  return { stdout: '', stderr: '' };
}

function assPathFrom(args: string[]): string | undefined {
  const filter = args[args.indexOf('-vf') + 1] ?? '';
  const match = /^ass=filename=(.+?):fontsdir=/.exec(filter);
  return match ? match[1].replace(/\\\\\\(.)/g, '$1') : undefined;
}

const captions: CaptionRow[] = [
  { id: 'before', startMs: 0, endMs: 900, original: 'Before the trim', translation: 'Pre trima' },
  { id: 'crosses-start', startMs: 900, endMs: 2200, original: 'Crosses the start', translation: 'Seca pocetak' },
  { id: 'crosses-end', startMs: 2500, endMs: 3500, original: 'Crosses the end', translation: 'Prelazi kraj' }
];

async function setup(overrides: Partial<ProjectExportRequest> = {}, files: Record<string, string> = {}) {
  const folder = await mkdtemp(join(tmpdir(), 'tajtlisha-export-test-'));
  await writeFile(join(folder, 'source.mp4'), 'source video');
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(folder, name), content, 'utf8');
  }
  const request: ProjectExportRequest = {
    jobId: 'job-1',
    inputPath: join(folder, 'source.mp4'),
    outputFolder: folder,
    baseName: 'clip',
    videoWidth: 720,
    videoHeight: 1280,
    trim: { startMs: 1000, endMs: 3000 },
    captions,
    sourceLanguage: 'en',
    targetLanguage: 'sr-Latn',
    style: DEFAULT_SUBTITLE_STYLE,
    outputs: { originalSrt: true, translationSrt: true, video: 'none' },
    overwritePolicy: 'ask',
    ...overrides
  };
  return { folder, request };
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

describe('project export validation', () => {
  it('rejects a request with nothing to export before writing anything', async () => {
    const { folder, request } = await setup({ outputs: { originalSrt: false, translationSrt: false, video: 'none' } });
    const { service, calls } = fakeFfmpeg();

    try {
      await expectAppError(new ProjectExportService({ ffmpeg: service, fontsDir: '/fonts' }).exportProject(request), 'NOTHING_TO_EXPORT');
      expect(await readdir(folder)).toEqual(['source.mp4']);
      expect(calls).toHaveLength(0);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('rejects invalid trim ranges', async () => {
    const { folder, request } = await setup();
    const service = new ProjectExportService({ ffmpeg: fakeFfmpeg().service, fontsDir: '/fonts' });

    try {
      await expectAppError(service.exportProject({ ...request, trim: { startMs: 2000, endMs: 2000 } }), 'INVALID_TRIM');
      await expectAppError(service.exportProject({ ...request, trim: { startMs: -1, endMs: 2000 } }), 'INVALID_TRIM');
      await expectAppError(service.exportProject({ ...request, trim: { startMs: 3000, endMs: 1000 } }), 'INVALID_TRIM');
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('rejects base names with separators or dot segments, and missing folders', async () => {
    const { folder, request } = await setup();
    const service = new ProjectExportService({ ffmpeg: fakeFfmpeg().service, fontsDir: '/fonts' });

    try {
      for (const baseName of ['', '   ', 'a/b', 'a\\b', '.', '..']) {
        await expectAppError(service.exportProject({ ...request, baseName }), 'OUTPUT_FOLDER_INVALID');
      }
      await expectAppError(service.exportProject({ ...request, outputFolder: join(folder, 'missing') }), 'OUTPUT_FOLDER_INVALID');
      await expectAppError(service.exportProject({ ...request, outputFolder: join(folder, 'source.mp4') }), 'OUTPUT_FOLDER_INVALID');
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('rejects a missing source file', async () => {
    const { folder, request } = await setup({ inputPath: join(tmpdir(), 'tajtlisha-no-such-file.mp4') });
    const service = new ProjectExportService({ ffmpeg: fakeFfmpeg().service, fontsDir: '/fonts' });

    try {
      await expectAppError(service.exportProject(request), 'SOURCE_MISSING');
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('reports overlapping captions by id with INVALID_TIMING', async () => {
    const { folder, request } = await setup({
      captions: [
        { id: 'a', startMs: 1200, endMs: 2000, original: 'A', translation: 'A' },
        { id: 'b', startMs: 1500, endMs: 2500, original: 'B', translation: 'B' }
      ]
    });
    const service = new ProjectExportService({ ffmpeg: fakeFfmpeg().service, fontsDir: '/fonts' });

    try {
      const error = await expectAppError(service.exportProject(request), 'INVALID_TIMING');
      expect(error.detail).toBe('b (overlap)');
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('refuses translation output while captions still lack a translation', async () => {
    const { folder, request } = await setup({
      captions: [
        { id: 'a', startMs: 1200, endMs: 2000, original: 'A', translation: '' },
        { id: 'b', startMs: 2100, endMs: 2500, original: 'B', translation: '' },
        { id: 'c', startMs: 2600, endMs: 2800, original: '', translation: '' }
      ]
    });
    const service = new ProjectExportService({ ffmpeg: fakeFfmpeg().service, fontsDir: '/fonts' });

    try {
      const error = await expectAppError(service.exportProject(request), 'TRANSLATION_INCOMPLETE');
      expect(error.detail).toContain('2 caption(s)');
      expect(await readdir(folder)).toEqual(['source.mp4']);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});

describe('project export outputs', () => {
  it('shifts and clips captions to the trim range and writes SRT files from 00:00:00', async () => {
    const { folder, request } = await setup();
    const service = new ProjectExportService({ ffmpeg: fakeFfmpeg().service, fontsDir: '/fonts' });

    try {
      const result = await service.exportProject(request);

      expect(result.files).toEqual([
        { kind: 'original_srt', path: join(folder, 'clip.en.srt') },
        { kind: 'translation_srt', path: join(folder, 'clip.sr-Latn.srt') }
      ]);
      expect(await readFile(join(folder, 'clip.en.srt'), 'utf8')).toBe(
        [
          '1',
          '00:00:00,000 --> 00:00:01,200',
          'Crosses the start',
          '',
          '2',
          '00:00:01,500 --> 00:00:02,000',
          'Crosses the end',
          ''
        ].join('\n')
      );
      expect(await readFile(join(folder, 'clip.sr-Latn.srt'), 'utf8')).toContain('Seca pocetak');
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('skips rows with empty original text for original outputs', async () => {
    const { folder, request } = await setup({
      captions: [
        { id: 'a', startMs: 1200, endMs: 1800, original: '', translation: 'Samo prevod' },
        { id: 'b', startMs: 2000, endMs: 2500, original: 'Original', translation: 'Prevod' }
      ],
      outputs: { originalSrt: true, translationSrt: false, video: 'none' }
    });
    const service = new ProjectExportService({ ffmpeg: fakeFfmpeg().service, fontsDir: '/fonts' });

    try {
      await service.exportProject(request);
      const srt = await readFile(join(folder, 'clip.en.srt'), 'utf8');
      expect(srt).toBe('1\n00:00:01,000 --> 00:00:01,500\nOriginal\n');
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('keeps line breaks inside one SRT cue', async () => {
    const { folder, request } = await setup({
      captions: [{ id: 'a', startMs: 1200, endMs: 2000, original: 'Prvi red\nDrugi red', translation: 'x' }],
      outputs: { originalSrt: true, translationSrt: false, video: 'none' }
    });
    const service = new ProjectExportService({ ffmpeg: fakeFfmpeg().service, fontsDir: '/fonts' });

    try {
      await service.exportProject(request);
      expect(await readFile(join(folder, 'clip.en.srt'), 'utf8')).toBe('1\n00:00:00,200 --> 00:00:01,000\nPrvi red\nDrugi red\n');
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('never calls ffmpeg for SRT-only exports', async () => {
    const { folder, request } = await setup();
    const { service, calls } = fakeFfmpeg();

    try {
      await new ProjectExportService({ ffmpeg: service, fontsDir: '/fonts' }).exportProject(request);
      expect(calls).toHaveLength(0);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('renders the video from the trim start with the ASS file and the chosen text field', async () => {
    const { folder, request } = await setup({ outputs: { originalSrt: false, translationSrt: false, video: 'translation' } });
    const { service, calls } = fakeFfmpeg();

    try {
      const result = await new ProjectExportService({ ffmpeg: service, fontsDir: '/fonts' }).exportProject(request);
      const args = calls[0].args;

      expect(result.files).toEqual([{ kind: 'video', path: join(folder, 'clip.subtitled.mp4') }]);
      expect(args.slice(0, 8)).toEqual(['-y', '-ss', '1.000', '-i', join(folder, 'source.mp4'), '-t', '2.000', '-map']);
      expect(args).toEqual(expect.arrayContaining(['-f', 'mp4', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac']));
      expect(args[args.length - 1]).toBe(join(folder, '.clip.subtitled.mp4.tajtlisha-tmp'));
      expect(args[args.indexOf('-vf') + 1]).toMatch(/^ass=filename=.+:fontsdir=\/fonts$/);
      expect(calls[0].assDocument).toContain('PlayResX: 720');
      expect(calls[0].assDocument).toContain('Dialogue: 0,0:00:00.00,0:00:01.20,Default,,0,0,0,,Seca pocetak');
      expect(calls[0].assDocument).toContain('Dialogue: 0,0:00:01.50,0:00:02.00,Default,,0,0,0,,Prelazi kraj');
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('removes the temporary ASS folder after rendering', async () => {
    const { folder, request } = await setup({ outputs: { originalSrt: false, translationSrt: false, video: 'original' } });
    let assPath = '';
    const { service } = fakeFfmpeg(async (args) => {
      assPath = assPathFrom(args) ?? '';
      await writeOutput(args);
      return { stdout: '', stderr: '' };
    });

    try {
      await new ProjectExportService({ ffmpeg: service, fontsDir: '/fonts' }).exportProject(request);
      expect(assPath).not.toBe('');
      await expect(access(assPath)).rejects.toThrow();
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('reports rendering progress as a 0..1 fraction and then writing_srt', async () => {
    const { folder, request } = await setup();
    const events: Array<{ stage: string; progress?: number }> = [];
    const { service } = fakeFfmpeg(async (args, options) => {
      options.onProgress?.(500);
      options.onProgress?.(1000);
      options.onProgress?.(5000);
      await writeOutput(args);
      return { stdout: '', stderr: '' };
    });

    try {
      await new ProjectExportService({ ffmpeg: service, fontsDir: '/fonts' }).exportProject(
        { ...request, outputs: { originalSrt: true, translationSrt: false, video: 'original' } },
        { onProgress: (event) => events.push(event) }
      );

      expect(events).toEqual([
        { stage: 'rendering_video', progress: 0 },
        { stage: 'rendering_video', progress: 0.25 },
        { stage: 'rendering_video', progress: 0.5 },
        { stage: 'rendering_video', progress: 1 },
        { stage: 'writing_srt' }
      ]);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});

describe('project export file policy', () => {
  it('refuses to overwrite the source video', async () => {
    // The input is itself a planned output: baseName "source" + source language "en" gives "source.en.srt".
    const { folder, request } = await setup({ baseName: 'source' });
    const inputPath = join(folder, 'source.en.srt');
    await writeFile(inputPath, 'source');
    const service = new ProjectExportService({ ffmpeg: fakeFfmpeg().service, fontsDir: '/fonts' });

    try {
      await expectAppError(service.exportProject({ ...request, inputPath }), 'OUTPUT_IS_SOURCE');
      expect(await readFile(inputPath, 'utf8')).toBe('source');
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('asks with OUTPUT_EXISTS and touches nothing when a planned file exists', async () => {
    const { folder, request } = await setup({}, { 'clip.sr-Latn.srt': 'keep me' });
    const { service, calls } = fakeFfmpeg();

    try {
      const error = await expectAppError(
        new ProjectExportService({ ffmpeg: service, fontsDir: '/fonts' }).exportProject({
          ...request,
          outputs: { originalSrt: true, translationSrt: true, video: 'original' }
        }),
        'OUTPUT_EXISTS'
      );
      expect(error.detail).toBe(join(folder, 'clip.sr-Latn.srt'));
      expect(await readFile(join(folder, 'clip.sr-Latn.srt'), 'utf8')).toBe('keep me');
      expect(await readdir(folder)).toHaveLength(2);
      expect(calls).toHaveLength(0);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('create_copy writes the whole bundle under the next free copy number', async () => {
    const { folder, request } = await setup(
      {},
      { 'clip.en.srt': 'old', 'clip.en (2).srt': 'older', 'clip.subtitled.mp4': 'old video' }
    );
    const service = new ProjectExportService({ ffmpeg: fakeFfmpeg().service, fontsDir: '/fonts' });

    try {
      const result = await service.exportProject({
        ...request,
        outputs: { originalSrt: true, translationSrt: true, video: 'original' },
        overwritePolicy: 'create_copy'
      });

      expect(result.files.map((file) => file.path)).toEqual([
        join(folder, 'clip.en (3).srt'),
        join(folder, 'clip.sr-Latn (3).srt'),
        join(folder, 'clip.subtitled (3).mp4')
      ]);
      expect(await readFile(join(folder, 'clip.en.srt'), 'utf8')).toBe('old');
      expect(await readFile(join(folder, 'clip.subtitled.mp4'), 'utf8')).toBe('old video');
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('overwrite replaces existing outputs', async () => {
    const { folder, request } = await setup({ overwritePolicy: 'overwrite' }, { 'clip.en.srt': 'old' });
    const service = new ProjectExportService({ ffmpeg: fakeFfmpeg().service, fontsDir: '/fonts' });

    try {
      await service.exportProject({ ...request, outputs: { originalSrt: true, translationSrt: false, video: 'none' } });
      expect(await readFile(join(folder, 'clip.en.srt'), 'utf8')).toContain('Crosses the start');
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('refuses two outputs with the same name when source and target language match', async () => {
    const { folder, request } = await setup({ targetLanguage: 'en' });
    const service = new ProjectExportService({ ffmpeg: fakeFfmpeg().service, fontsDir: '/fonts' });

    try {
      await expectAppError(service.exportProject(request), 'OUTPUT_FOLDER_INVALID');
      expect(await readdir(folder)).toEqual(['source.mp4']);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('removes temp files and leaves no outputs when ffmpeg fails', async () => {
    const { folder, request } = await setup();
    const { service } = fakeFfmpeg(async (args) => {
      await writeFile(args[args.length - 1], 'partial', 'utf8');
      throw new AppError('FFMPEG_FAILED', 'boom');
    });

    try {
      await expectAppError(
        new ProjectExportService({ ffmpeg: service, fontsDir: '/fonts' }).exportProject({
          ...request,
          outputs: { originalSrt: true, translationSrt: true, video: 'original' }
        }),
        'FFMPEG_FAILED'
      );
      expect(await readdir(folder)).toEqual(['source.mp4']);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('removes temp files and rethrows JOB_CANCELED when the job is canceled mid-render', async () => {
    const { folder, request } = await setup({ outputs: { originalSrt: true, translationSrt: false, video: 'original' } });
    const controller = new AbortController();
    const { service } = fakeFfmpeg(async (args) => {
      await writeFile(args[args.length - 1], 'partial', 'utf8');
      controller.abort();
      throw new AppError('JOB_CANCELED');
    });

    try {
      await expectAppError(
        new ProjectExportService({ ffmpeg: service, fontsDir: '/fonts' }).exportProject(request, { signal: controller.signal }),
        'JOB_CANCELED'
      );
      expect(await readdir(folder)).toEqual(['source.mp4']);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('cancels before writing anything when the signal is already aborted', async () => {
    const { folder, request } = await setup();
    const controller = new AbortController();
    controller.abort();
    const { service, calls } = fakeFfmpeg();

    try {
      await expectAppError(
        new ProjectExportService({ ffmpeg: service, fontsDir: '/fonts' }).exportProject(request, { signal: controller.signal }),
        'JOB_CANCELED'
      );
      expect(await readdir(folder)).toEqual(['source.mp4']);
      expect(calls).toHaveLength(0);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });

  it('sanitizes language tags in file names', async () => {
    const { folder, request } = await setup({ sourceLanguage: 'en/US', targetLanguage: '  ' });

    try {
      const result = await new ProjectExportService({ ffmpeg: fakeFfmpeg().service, fontsDir: '/fonts' }).exportProject({
        ...request,
        outputs: { originalSrt: true, translationSrt: true, video: 'none' }
      });
      expect(result.files.map((file) => file.path)).toEqual([join(folder, 'clip.en-US.srt'), join(folder, 'clip.und.srt')]);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});

describe('export helpers', () => {
  it('escapes filter option values for the two-level ffmpeg parser', () => {
    expect(escapeFilterValue('/a b/c:d,e')).toBe('/a b/c\\\\\\:d\\\\\\,e');
    expect(escapeFilterValue("it's\\x")).toBe("it\\\\\\'s\\\\\\\\x");
  });

  it('builds copy file names with a space and number before the extension', () => {
    expect(buildCopyFilename('/out/clip.en.srt', 1)).toBe('/out/clip.en (2).srt');
    expect(buildCopyFilename('/out/clip.subtitled.mp4', 2)).toBe('/out/clip.subtitled (3).mp4');
  });

  it('formats SRT timestamps', () => {
    expect(formatSrtTimestamp(3_723_004)).toBe('01:02:03,004');
  });

  it('validates timing and refuses to serialize invalid tracks', () => {
    const track: SubtitleTrack = {
      id: 'track-1',
      kind: 'original',
      language: 'en',
      segments: [
        { id: 'a', startMs: -1, endMs: 1000, text: 'Bad start', language: 'en' },
        { id: 'b', startMs: 900, endMs: 800, text: 'Bad duration', language: 'en' }
      ]
    };

    expect(validateSubtitleTiming(track.segments).map((issue) => issue.code)).toEqual(['negative_start', 'non_positive_duration', 'overlap']);
    expect(() => serializeSrt(track)).toThrow('[INVALID_TIMING]');
  });

  it('serializes a subtitle track as SRT', () => {
    const track: SubtitleTrack = {
      id: 'track-1',
      kind: 'translation',
      language: 'sr-Latn',
      segments: [
        { id: 'a', startMs: 0, endMs: 2400, text: 'Primer titla', language: 'sr-Latn' },
        { id: 'b', startMs: 2500, endMs: 5000, text: 'Sledeci segment', language: 'sr-Latn' }
      ]
    };

    expect(serializeSrt(track)).toBe(
      ['1', '00:00:00,000 --> 00:00:02,400', 'Primer titla', '', '2', '00:00:02,500 --> 00:00:05,000', 'Sledeci segment', ''].join('\n')
    );
  });
});
