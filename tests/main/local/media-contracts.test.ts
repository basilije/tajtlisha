/* @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import type { FfmpegService } from '../../../src/main/ffmpeg';
import { MediaService, millisecondsToSeconds, validateAudioExtractRequest, validateTimeRange, validateTrimRequest } from '../../../src/main/media';

describe('media contracts', () => {
  it('validates trim ranges', () => {
    expect(() =>
      validateTrimRequest({
        inputPath: '/in.mp4',
        outputPath: '/out.mp4',
        startMs: 1000,
        endMs: 2000,
        knownDurationMs: 3000
      })
    ).not.toThrow();

    expect(() => validateTimeRange(2000, 1000)).toThrow('endMs must be greater than startMs.');
    expect(() => validateTimeRange(0, 4000, 3000)).toThrow('endMs cannot exceed knownDurationMs.');
  });

  it('validates audio extraction contracts', () => {
    expect(() =>
      validateAudioExtractRequest({
        inputPath: '/in.mp4',
        outputPath: '/out.wav',
        format: 'wav',
        startMs: 0,
        endMs: 1500
      })
    ).not.toThrow();

    expect(millisecondsToSeconds(1250)).toBe('1.250');
  });

  it('creates an H.264/AAC preview proxy for unsupported browser codecs', async () => {
    const run = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const service = new MediaService({ run } as unknown as FfmpegService);

    await service.createPreviewProxy('/clips/source.mp4', '/tmp/preview.mp4');

    expect(run).toHaveBeenCalledWith([
      '-y',
      '-i',
      '/clips/source.mp4',
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      '/tmp/preview.mp4'
    ], {});
  });

  it('trims with output-side seeking and re-encoding for precise boundaries', async () => {
    const run = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const service = new MediaService({ run } as unknown as FfmpegService);

    await service.trim({
      inputPath: '/clips/source.mp4',
      outputPath: '/tmp/trimmed.mp4',
      startMs: 1250,
      endMs: 3250,
      knownDurationMs: 5000
    });

    expect(run).toHaveBeenCalledWith([
      '-y',
      '-i',
      '/clips/source.mp4',
      '-ss',
      '1.250',
      '-t',
      '2.000',
      '-map',
      '0:v:0?',
      '-map',
      '0:a:0?',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-c:a',
      'aac',
      '-avoid_negative_ts',
      'make_zero',
      '/tmp/trimmed.mp4'
    ], {});
  });
});
