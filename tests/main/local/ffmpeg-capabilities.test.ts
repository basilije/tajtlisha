/* @vitest-environment node */
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { checkFfmpegCapabilities, parseEncoderNames, parseFfprobeVersion, parseFilterNames } from '../../../src/main/ffmpeg';
import { FfmpegService } from '../../../src/main/ffmpeg';

const ffmpegAvailable = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;

const FILTERS_SAMPLE = `Filters:
  T.. = Timeline support
  .S. = Slice threading
  ..C = Command support
  A = Audio input/output
  V = Video input/output
  N = Dynamic number and/or type of input/output
  | = Source or sink filter
 ... abench           A->A       Benchmark part of a filtergraph.
 ..C acompressor      A->A       Audio compressor.
 T.. ass              V->V       Render ASS subtitles onto input video using the libass library.
 ... scale            V->V       Scale the input video size and/or convert the image format.
 ..C subtitles        V->V       Render text subtitles onto input video using the libass library.
`;

const ENCODERS_SAMPLE = `Encoders:
 V..... = Video
 A..... = Audio
 S..... = Subtitle
 .F.... = Frame-level multithreading
 ..S... = Slice-level multithreading
 ...X.. = Codec is experimental
 ....B. = Supports draw_horiz_band
 .....D = Supports direct rendering method 1
 ------
 V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (codec h264)
 V....D libx265              libx265 H.265 / HEVC (codec hevc)
 A....D aac                  AAC (Advanced Audio Coding)
 A....D libmp3lame           libmp3lame MP3 (MPEG audio layer 3) (codec mp3)
 S..... ssa                  ASS (Advanced SubStation Alpha) subtitle
`;

describe('ffmpeg filter and encoder listings', () => {
  it('reads filter names and skips the legend lines', () => {
    const names = parseFilterNames(FILTERS_SAMPLE);

    expect(names.has('ass')).toBe(true);
    expect(names.has('scale')).toBe(true);
    expect(names.has('subtitles')).toBe(true);
    expect(names.has('=')).toBe(false);
    expect(names.has('Timeline')).toBe(false);
    expect(names.has('Filters:')).toBe(false);
  });

  it('reads encoder names with their six flag columns and skips the legend', () => {
    const names = parseEncoderNames(ENCODERS_SAMPLE);

    expect([...names].sort()).toEqual(['aac', 'libmp3lame', 'libx264', 'libx265', 'ssa']);
    expect(names.has('=')).toBe(false);
    expect(names.has('Video')).toBe(false);
  });

  it('returns empty sets for empty or unrelated output', () => {
    expect(parseFilterNames('')).toEqual(new Set());
    expect(parseEncoderNames('ffmpeg: command not found')).toEqual(new Set());
  });

  it('reads only the name column, not words in the description', () => {
    const names = parseFilterNames(' ... noop           V->V       Pass the ass subtitles through unchanged.\n');
    expect(names.has('ass')).toBe(false);
    expect(names.has('noop')).toBe(true);
  });
});

describe('ffprobe version line', () => {
  it('reads the version number from the first line', () => {
    expect(parseFfprobeVersion('ffprobe version 8.1.3 Copyright (c) 2007-2026 the FFmpeg developers\nbuilt with gcc')).toBe('8.1.3');
    expect(parseFfprobeVersion('ffprobe version N-120000-gabcdef Copyright\n')).toBe('N-120000-gabcdef');
  });

  it('returns undefined when there is no version', () => {
    expect(parseFfprobeVersion('')).toBeUndefined();
    expect(parseFfprobeVersion('usage: something')).toBeUndefined();
  });
});

describe('checkFfmpegCapabilities', () => {
  it('reports every capability missing when the binaries cannot run', async () => {
    const capabilities = await checkFfmpegCapabilities(
      new FfmpegService({ ffmpegPath: '/nonexistent/tajtlisha-ffmpeg', ffprobePath: '/nonexistent/tajtlisha-ffprobe' })
    );

    expect(capabilities).toEqual({
      ffmpeg: false,
      ffprobe: false,
      assFilter: false,
      libx264: false,
      aac: false,
      mp3: false,
      version: undefined,
      missing: ['ffmpeg', 'ffprobe', 'ass filter (libass)', 'libx264 encoder', 'aac encoder', 'libmp3lame encoder']
    });
  });

  it.skipIf(!ffmpegAvailable)('reads the installed ffmpeg and keeps missing in step with the flags', async () => {
    const capabilities = await checkFfmpegCapabilities(new FfmpegService());

    expect(capabilities.ffmpeg).toBe(true);
    expect(capabilities.ffprobe).toBe(true);
    // Release builds print '8.1.3'; the bundled BtbN snapshot prints 'N-127900-g...'.
    expect(capabilities.version).toMatch(/^(\d|N-)/);
    const flags: Array<[boolean, string]> = [
      [capabilities.ffmpeg, 'ffmpeg'],
      [capabilities.ffprobe, 'ffprobe'],
      [capabilities.assFilter, 'ass filter (libass)'],
      [capabilities.libx264, 'libx264 encoder'],
      [capabilities.aac, 'aac encoder'],
      [capabilities.mp3, 'libmp3lame encoder']
    ];
    expect(capabilities.missing).toEqual(flags.filter(([present]) => !present).map(([, name]) => name));
  }, 30_000);

  it('reads the two-character flag column of ffmpeg 8', () => {
    const names = parseFilterNames(
      [
        'Filters:',
        '  T.. = Timeline support',
        ' .. ass               V->V       Render ASS subtitles onto input video using the libass library.',
        ' .. subtitles         V->V       Render text subtitles onto input video using the libass library.',
        ' T. scale             V->V       Scale the input video size and/or convert the image format.'
      ].join('\r\n')
    );
    expect(names.has('ass')).toBe(true);
    expect(names.has('subtitles')).toBe(true);
    expect(names.has('scale')).toBe(true);
    expect(names.has('Timeline')).toBe(false);
  });
});
