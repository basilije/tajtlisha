import { describe, expect, it, vi } from 'vitest';
import { detectSpeechRegions, parseSpeechRegions } from '../../../src/main/ai/speech-regions';

const SAMPLE_STDERR = `
ffmpeg version 6.1 Copyright (c) 2000-2023 the FFmpeg developers
Input #0, mp3, from '/tmp/tajtlisha-ai-audio-x/audio.mp3':
  Duration: 00:00:10.04, start: 0.025057, bitrate: 128 kb/s
  Stream #0:0: Audio: mp3, 16000 Hz, mono, fltp, 128 kb/s
Stream mapping:
  Stream #0:0 -> #0:0 (mp3 (mp3float) -> pcm_s16le (native))
[silencedetect @ 0x55d5c8a0] silence_start: 1.2
[silencedetect @ 0x55d5c8a0] silence_end: 2.5 | silence_duration: 1.3
[silencedetect @ 0x55d5c8a0] silence_start: 6
[silencedetect @ 0x55d5c8a0] silence_end: 7.1 | silence_duration: 1.1
size=N/A time=00:00:10.04 bitrate=N/A speed= 300x
`;

describe('parseSpeechRegions', () => {
  it('returns the complement of silence within the audio duration', () => {
    expect(parseSpeechRegions(SAMPLE_STDERR)).toEqual([
      { startMs: 0, endMs: 1200 },
      { startMs: 2500, endMs: 6000 },
      { startMs: 7100, endMs: 10040 }
    ]);
  });

  it('treats a silence that runs to the end of the file as a closing gap', () => {
    const stderr = `Duration: 00:00:10.00, start: 0
[silencedetect @ 0x1] silence_start: 8`;

    expect(parseSpeechRegions(stderr)).toEqual([{ startMs: 0, endMs: 8000 }]);
  });

  it('returns the whole clip as speech when no silence is reported', () => {
    expect(parseSpeechRegions('Duration: 00:00:03.50, start: 0')).toEqual([{ startMs: 0, endMs: 3500 }]);
  });

  it('uses the fallback duration when ffmpeg prints no Duration line', () => {
    const stderr = `[silencedetect @ 0x1] silence_start: 1
[silencedetect @ 0x1] silence_end: 2 | silence_duration: 1`;

    expect(parseSpeechRegions(stderr, 5000)).toEqual([
      { startMs: 0, endMs: 1000 },
      { startMs: 2000, endMs: 5000 }
    ]);
  });

  it('returns nothing when the whole clip is silent', () => {
    const stderr = `Duration: 00:00:02.00, start: 0
[silencedetect @ 0x1] silence_start: 0
[silencedetect @ 0x1] silence_end: 2 | silence_duration: 2`;

    expect(parseSpeechRegions(stderr)).toEqual([]);
  });

  it('returns nothing when the duration is unknown', () => {
    expect(parseSpeechRegions('[silencedetect @ 0x1] silence_start: 1')).toEqual([]);
  });

  it('clamps silence that extends past the reported duration', () => {
    const stderr = `Duration: 00:00:04.00, start: 0
[silencedetect @ 0x1] silence_start: 3
[silencedetect @ 0x1] silence_end: 9 | silence_duration: 6`;

    expect(parseSpeechRegions(stderr)).toEqual([{ startMs: 0, endMs: 3000 }]);
  });
});

describe('detectSpeechRegions', () => {
  it('runs silencedetect with the agreed filter and parses its stderr', async () => {
    const run = vi.fn().mockResolvedValue({ stdout: '', stderr: SAMPLE_STDERR });
    const controller = new AbortController();

    const regions = await detectSpeechRegions('/tmp/audio.mp3', { run }, { signal: controller.signal });

    expect(run).toHaveBeenCalledWith(
      ['-hide_banner', '-i', '/tmp/audio.mp3', '-af', 'silencedetect=noise=-35dB:d=0.35', '-f', 'null', '-'],
      { signal: controller.signal }
    );
    expect(regions).toHaveLength(3);
  });
});
