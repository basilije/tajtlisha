/* @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCopyFilename, buildExportFilename, formatSrtTimestamp, serializeSrt, validateSubtitleTiming } from '../../../src/main/export';
import { SubtitleBurnService } from '../../../src/main/export/burn-subtitles';
import { ExportOutputConflictError, ProjectExportService } from '../../../src/main/export/project-export-service';
import type { SubtitleTrack } from '../../../src/shared/types/subtitles';
import type { SubtitleStyle } from '../../../src/shared/types/style';

describe('SRT export', () => {
  it('serializes subtitle tracks with SRT timestamps', () => {
    const track: SubtitleTrack = {
      id: 'track-1',
      kind: 'translation',
      language: 'sr-Latn',
      sourceLanguage: 'en',
      targetLanguage: 'sr-Latn',
      segments: [
        { id: 'a', startMs: 0, endMs: 2400, text: 'Primer titla', language: 'sr-Latn' },
        { id: 'b', startMs: 2500, endMs: 5000, text: 'Sledeci segment', language: 'sr-Latn' }
      ]
    };

    expect(serializeSrt(track)).toBe(
      ['1', '00:00:00,000 --> 00:00:02,400', 'Primer titla', '', '2', '00:00:02,500 --> 00:00:05,000', 'Sledeci segment', ''].join('\n')
    );
  });

  it('validates negative, inverted, and overlapping timing', () => {
    const track: SubtitleTrack = {
      id: 'track-1',
      kind: 'original',
      language: 'en',
      segments: [
        { id: 'a', startMs: -1, endMs: 1000, text: 'Bad start', language: 'en' },
        { id: 'b', startMs: 900, endMs: 800, text: 'Bad duration', language: 'en' }
      ]
    };

    expect(validateSubtitleTiming(track).map((issue) => issue.code)).toEqual(['negative_start', 'non_positive_duration', 'overlap']);
  });

  it('builds export filenames from pattern tokens', () => {
    expect(
      buildExportFilename({
        inputPath: '/clips/source video.mp4',
        outputFolder: '/out',
        track: { kind: 'translation', language: 'sr-Latn', targetLanguage: 'sr-Latn' },
        extension: 'srt',
        pattern: '{name}.{language}.{track}'
      })
    ).toBe('/out/source video.sr-Latn.translation.srt');

    expect(buildCopyFilename('/out/source.srt', 1)).toBe('/out/source (2).srt');
    expect(formatSrtTimestamp(3_723_004)).toBe('01:02:03,004');
  });

  it('burns subtitles through ffmpeg with a temporary SRT file and style filter', async () => {
    const calls: string[][] = [];
    let srtPath = '';

    const ffmpeg = {
      ffmpegPath: 'ffmpeg',
      ffprobePath: 'ffprobe',
      getStatus: async () => ({ available: true as const, path: 'ffmpeg' }),
      ffprobe: async () => ({ stdout: '{}', stderr: '' }),
      run: async (args: string[]) => {
        calls.push(args);
        const filter = args[args.indexOf('-vf') + 1];
        const match = /^subtitles='([^']+)'/.exec(filter);
        if (!match) {
          throw new Error(`Unexpected subtitles filter: ${filter}`);
        }
        srtPath = match[1];
        expect(await readFile(srtPath, 'utf8')).toContain('Primer titla');
        return { stdout: '', stderr: '' };
      }
    };

    const service = new SubtitleBurnService(ffmpeg);
    await expect(
      service.burnSubtitles({
        inputPath: '/clips/input video.mp4',
        outputPath: '/exports/output video.mp4',
        track: sampleTrack,
        style: sampleStyle
      })
    ).resolves.toEqual({ outputPath: '/exports/output video.mp4' });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(
      expect.arrayContaining(['-n', '-i', '/clips/input video.mp4', '-vf', expect.stringContaining('force_style='), '-c:a', 'copy', '/exports/output video.mp4'])
    );
    expect(calls[0][calls[0].indexOf('-vf') + 1]).toContain('FontName=Inter Semi Bold');
    await expect(access(srtPath)).rejects.toThrow();
  });

  it('exports a trimmed project bundle with SRTs and burned-in video', async () => {
    const outputFolder = await mkdtemp(join(tmpdir(), 'tajtlisha-export-test-'));
    const trimCalls: unknown[] = [];
    const burnCalls: unknown[] = [];

    const service = new ProjectExportService(
      {
        trim: async (input) => {
          trimCalls.push(input);
          return { outputPath: input.outputPath, durationMs: input.endMs - input.startMs };
        }
      },
      {
        burnSubtitles: async (input) => {
          burnCalls.push(input);
          return { outputPath: input.outputPath };
        }
      }
    );

    try {
      const result = await service.exportProject({
        inputPath: '/clips/source video.mp4',
        outputFolder,
        tracks: [sampleTrack],
        style: sampleStyle,
        trim: { startMs: 1000, endMs: 2200, knownDurationMs: 3000 },
        exportOriginalSrt: false,
        exportTranslatedSrt: true,
        burnedInTrack: 'translation',
        fileNamePattern: '{name}.{track}.{language}'
      });

      expect(result.translatedSrtPath).toBe(join(outputFolder, 'source video.translation.sr-Latn.srt'));
      expect(result.burnedInVideoPath).toBe(join(outputFolder, 'source video.translation.sr-Latn.burned.mp4'));
      expect(await readFile(result.translatedSrtPath ?? '', 'utf8')).toContain('00:00:00,000 --> 00:00:01,200');
      expect(trimCalls).toHaveLength(1);
      expect(burnCalls).toEqual([
        expect.objectContaining({
          outputPath: result.burnedInVideoPath,
          track: expect.objectContaining({
            segments: [expect.objectContaining({ startMs: 0, endMs: 1200 })]
          })
        })
      ]);
    } finally {
      await rm(outputFolder, { recursive: true, force: true });
    }
  });

  it('stops before writing when ask policy finds an existing output', async () => {
    const outputFolder = await mkdtemp(join(tmpdir(), 'tajtlisha-export-conflict-'));
    const existingSrtPath = join(outputFolder, 'source video.translation.srt');
    const burnCalls: unknown[] = [];
    await writeFile(existingSrtPath, 'keep this subtitle', 'utf8');
    const service = new ProjectExportService(
      { trim: async () => ({ outputPath: '', durationMs: 0 }) },
      { burnSubtitles: async (input) => {
        burnCalls.push(input);
        return { outputPath: input.outputPath };
      } }
    );

    try {
      await expect(
        service.exportProject({
          inputPath: '/clips/source video.mp4',
          outputFolder,
          tracks: [sampleTrack],
          style: sampleStyle,
          exportOriginalSrt: false,
          exportTranslatedSrt: true,
          burnedInTrack: 'translation'
        })
      ).rejects.toMatchObject({ code: 'EXPORT_OUTPUT_CONFLICT', paths: [existingSrtPath] } satisfies Partial<ExportOutputConflictError>);
      expect(await readFile(existingSrtPath, 'utf8')).toBe('keep this subtitle');
      expect(burnCalls).toHaveLength(0);
    } finally {
      await rm(outputFolder, { recursive: true, force: true });
    }
  });

  it('creates distinct copy names for existing and duplicate planned outputs', async () => {
    const outputFolder = await mkdtemp(join(tmpdir(), 'tajtlisha-export-copy-'));
    const existingSrtPath = join(outputFolder, 'source video.translation.srt');
    const existingVideoPath = join(outputFolder, 'source video.translation.burned.mp4');
    const burnCalls: unknown[] = [];
    await Promise.all([writeFile(existingSrtPath, 'existing', 'utf8'), writeFile(existingVideoPath, 'existing', 'utf8')]);
    const service = new ProjectExportService(
      { trim: async () => ({ outputPath: '', durationMs: 0 }) },
      { burnSubtitles: async (input) => {
        burnCalls.push(input);
        return { outputPath: input.outputPath };
      } }
    );

    try {
      const result = await service.exportProject({
        inputPath: '/clips/source video.mp4',
        outputFolder,
        tracks: [sampleTrack],
        style: sampleStyle,
        exportOriginalSrt: false,
        exportTranslatedSrt: true,
        burnedInTrack: 'translation',
        overwritePolicy: 'create_copy'
      });

      expect(result).toEqual({
        translatedSrtPath: join(outputFolder, 'source video.translation (2).srt'),
        burnedInVideoPath: join(outputFolder, 'source video.translation.burned (2).mp4')
      });
      expect(await readFile(existingSrtPath, 'utf8')).toBe('existing');
      expect(burnCalls).toEqual([expect.objectContaining({ outputPath: result.burnedInVideoPath, overwriteExisting: false })]);
    } finally {
      await rm(outputFolder, { recursive: true, force: true });
    }
  });

  it('rejects a missing output folder and filename patterns that escape it', async () => {
    const outputFolder = await mkdtemp(join(tmpdir(), 'tajtlisha-export-folder-'));
    const service = new ProjectExportService(
      { trim: async () => ({ outputPath: '', durationMs: 0 }) },
      { burnSubtitles: async (input) => ({ outputPath: input.outputPath }) }
    );

    try {
      await expect(
        service.exportProject({
          inputPath: '/clips/source video.mp4',
          outputFolder: join(outputFolder, 'missing'),
          tracks: [sampleTrack],
          style: sampleStyle,
          exportOriginalSrt: false,
          exportTranslatedSrt: false,
          burnedInTrack: 'translation'
        })
      ).rejects.toThrow('outputFolder must be an existing directory.');

      await expect(
        service.exportProject({
          inputPath: '/clips/source video.mp4',
          outputFolder,
          tracks: [sampleTrack],
          style: sampleStyle,
          exportOriginalSrt: true,
          exportTranslatedSrt: false,
          burnedInTrack: 'translation',
          fileNamePattern: '../outside'
        })
      ).rejects.toThrow('fileNamePattern must produce files inside outputFolder.');
    } finally {
      await rm(outputFolder, { recursive: true, force: true });
    }
  });
});

const sampleTrack: SubtitleTrack = {
  id: 'track-1',
  kind: 'translation',
  language: 'sr-Latn',
  sourceLanguage: 'en',
  targetLanguage: 'sr-Latn',
  segments: [{ id: 'a', startMs: 0, endMs: 2400, text: 'Primer titla', language: 'sr-Latn' }]
};

const sampleStyle: SubtitleStyle = {
  fontFamily: 'Inter, Semi Bold',
  fontSizePx: 42,
  fontWeight: 'semibold',
  italic: false,
  textColor: '#fff2aa',
  outlineEnabled: true,
  outlineColor: '#101010',
  outlineWidthPx: 2,
  shadowEnabled: true,
  shadowColor: '#000000',
  shadowBlurPx: 3,
  shadowOffsetX: 1,
  shadowOffsetY: 2,
  position: 'bottom',
  align: 'center',
  maxWidthPercent: 84,
  maxLines: 2
};
