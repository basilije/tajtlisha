import type { TrimRange } from '../../../../shared/types/project';

/** One frame at 30 fps. Used by the frame step buttons. */
export const FRAME_MS = 1000 / 30;

/** Media clocks are floats, so "at the end" allows a couple of milliseconds of slack. */
const END_TOLERANCE_MS = 2;

/** Clamps a source-absolute time into the trim range. */
export function clampToTrim(ms: number, trim: TrimRange): number {
  if (!Number.isFinite(ms)) return trim.startMs;
  return Math.min(trim.endMs, Math.max(trim.startMs, ms));
}

export function reachedTrimEnd(ms: number, trim: TrimRange): boolean {
  return ms >= trim.endMs - END_TOLERANCE_MS;
}

/** Where play starts: at the trim start when the playhead is already at (or past) the end. */
export function nextTimeOnPlay(ms: number, trim: TrimRange): number {
  return reachedTrimEnd(ms, trim) ? trim.startMs : clampToTrim(ms, trim);
}

/** Moves the playhead by whole frames (negative to step back), clamped to the trim. */
export function stepTime(ms: number, frames: number, trim: TrimRange): number {
  return clampToTrim(ms + frames * FRAME_MS, trim);
}

/**
 * Largest rectangle with the given aspect ratio (width / height) that fits the
 * available area. Returns zero size while the area is not measured yet.
 */
export function fitFrame(
  availableWidth: number,
  availableHeight: number,
  aspectRatio: number
): { width: number; height: number } {
  if (!(availableWidth > 0 && availableHeight > 0 && aspectRatio > 0)) {
    return { width: 0, height: 0 };
  }

  if (aspectRatio >= availableWidth / availableHeight) {
    return { width: Math.floor(availableWidth), height: Math.floor(availableWidth / aspectRatio) };
  }

  return { width: Math.floor(availableHeight * aspectRatio), height: Math.floor(availableHeight) };
}
