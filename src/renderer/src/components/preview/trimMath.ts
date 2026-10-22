import { clamp } from '../../../../shared/subtitle-geometry';
import type { TrimRange } from '../../../../shared/types/project';

/** Shortest kept range the trim bar allows. */
export const MIN_TRIM_MS = 100;
/** Arrow key step, and the step with Shift held. */
export const KEY_STEP_MS = 100;
export const KEY_STEP_LARGE_MS = 1000;

export type TrimHandle = 'start' | 'end';

/** Returns the trim with one handle moved to `ms`, limited by the other handle, the source and the minimum length. */
export function moveTrimHandle(trim: TrimRange, handle: TrimHandle, ms: number, durationMs: number): TrimRange {
  if (handle === 'start') {
    return { startMs: clamp(ms, 0, trim.endMs - MIN_TRIM_MS), endMs: trim.endMs };
  }

  return { startMs: trim.startMs, endMs: clamp(ms, trim.startMs + MIN_TRIM_MS, durationMs) };
}

/** Source time under a pointer x position inside the track. */
export function msFromClientX(clientX: number, rect: { left: number; width: number }, durationMs: number): number {
  const width = rect.width > 0 ? rect.width : 1;
  const ratio = clamp((clientX - rect.left) / width, 0, 1);
  return Math.round(ratio * durationMs);
}

/** Position of a source time along the track, in percent. */
export function timeToPercent(ms: number, durationMs: number): number {
  return durationMs > 0 ? clamp(ms / durationMs, 0, 1) * 100 : 0;
}

const TICK_STEPS_MS = [500, 1000, 2000, 5000, 10000, 30000, 60000];

/** Smallest "nice" tick step that leaves at least `minSpacingPx` between labels. */
export function pickTickStep(durationMs: number, trackWidthPx: number, minSpacingPx = 64): number {
  if (durationMs <= 0 || trackWidthPx <= 0) return TICK_STEPS_MS[TICK_STEPS_MS.length - 1];

  const pxPerMs = trackWidthPx / durationMs;
  return TICK_STEPS_MS.find((step) => step * pxPerMs >= minSpacingPx) ?? TICK_STEPS_MS[TICK_STEPS_MS.length - 1];
}

/** Tick positions from 0 up to the duration, every `stepMs`. */
export function ticksFor(durationMs: number, stepMs: number): number[] {
  const ticks: number[] = [];
  for (let ms = 0; ms <= durationMs && ticks.length < 1000; ms += stepMs) {
    ticks.push(ms);
  }
  return ticks;
}
