import type { FfmpegService } from '../ffmpeg';
import type { SpeechRegion } from './caption-builder';

export type SpeechDetectionOptions = {
  signal?: AbortSignal;
  /** Used when ffmpeg does not print a Duration line. Pass the clip length. */
  durationMs?: number;
};

type SilenceInterval = { startMs: number; endMs: number };

/**
 * Finds speech by running ffmpeg silencedetect on the audio. Speech is the
 * complement of silence within the audio duration. Used when the provider
 * returns text without timing.
 */
export async function detectSpeechRegions(
  audioPath: string,
  ffmpeg: Pick<FfmpegService, 'run'>,
  options: SpeechDetectionOptions = {}
): Promise<SpeechRegion[]> {
  const { stderr } = await ffmpeg.run(
    ['-hide_banner', '-i', audioPath, '-af', 'silencedetect=noise=-35dB:d=0.35', '-f', 'null', '-'],
    { signal: options.signal }
  );

  return parseSpeechRegions(stderr, options.durationMs);
}

/**
 * Parses ffmpeg silencedetect stderr into speech regions. Pure, so it can be
 * tested against captured output. Returns [] when the duration is unknown.
 */
export function parseSpeechRegions(stderr: string, fallbackDurationMs?: number): SpeechRegion[] {
  const durationMs = parseDurationMs(stderr) ?? fallbackDurationMs;
  if (durationMs === undefined || !(durationMs > 0)) {
    return [];
  }

  const regions: SpeechRegion[] = [];
  let cursorMs = 0;

  for (const silence of parseSilenceIntervals(stderr, durationMs)) {
    if (silence.startMs > cursorMs) {
      regions.push({ startMs: cursorMs, endMs: silence.startMs });
    }
    cursorMs = Math.max(cursorMs, silence.endMs);
  }

  if (cursorMs < durationMs) {
    regions.push({ startMs: cursorMs, endMs: durationMs });
  }

  return regions;
}

/** Duration from the `Duration: HH:MM:SS.ss` line ffmpeg prints for an input. */
function parseDurationMs(stderr: string): number | undefined {
  const match = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderr);
  if (!match) return undefined;

  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : undefined;
}

/**
 * Pairs silence_start and silence_end events in order. A silence that runs to
 * the end of the file has no silence_end, so it closes at durationMs.
 */
function parseSilenceIntervals(stderr: string, durationMs: number): SilenceInterval[] {
  const intervals: SilenceInterval[] = [];
  let pendingStartMs: number | undefined;

  for (const match of stderr.matchAll(/silence_(start|end):\s*(-?\d+(?:\.\d+)?)/g)) {
    const timeMs = Math.round(Number(match[2]) * 1000);

    if (match[1] === 'start') {
      pendingStartMs = Math.max(0, timeMs);
      continue;
    }

    intervals.push({ startMs: pendingStartMs ?? 0, endMs: Math.min(timeMs, durationMs) });
    pendingStartMs = undefined;
  }

  if (pendingStartMs !== undefined && pendingStartMs < durationMs) {
    intervals.push({ startMs: pendingStartMs, endMs: durationMs });
  }

  return intervals.filter((interval) => interval.endMs > interval.startMs);
}
