/** Whole-UI zoom levels in percent. The renderer applies them as a page zoom factor (percent / 100). */
export const UI_ZOOM_LEVELS = [80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 140, 150] as const;

export const DEFAULT_UI_ZOOM_PERCENT = 100;

const levels: readonly number[] = UI_ZOOM_LEVELS;

/** Snaps any stored or patched value to the nearest allowed level. Non-numbers and NaN give 100%. */
export function normalizeUiZoom(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_UI_ZOOM_PERCENT;

  let nearest = levels[0];
  for (const level of levels) {
    if (Math.abs(level - value) < Math.abs(nearest - value)) nearest = level;
  }
  return nearest;
}

/** The next (1) or previous (-1) level after the current one. Stays at the first or last level. */
export function stepUiZoom(current: number, direction: 1 | -1): number {
  const index = levels.indexOf(normalizeUiZoom(current));
  const next = Math.min(levels.length - 1, Math.max(0, index + direction));
  return levels[next];
}
