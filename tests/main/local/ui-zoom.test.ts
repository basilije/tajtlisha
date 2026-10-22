/* @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { normalizeUiZoom, stepUiZoom, UI_ZOOM_LEVELS } from '../../../src/shared/ui-zoom';

describe('normalizeUiZoom', () => {
  it('keeps allowed levels and snaps other numbers to the nearest one', () => {
    expect(normalizeUiZoom(105)).toBe(105);
    expect(normalizeUiZoom(103)).toBe(105);
    expect(normalizeUiZoom(999)).toBe(150);
    expect(normalizeUiZoom(-5)).toBe(80);
  });

  it('falls back to 100% for values that are not finite numbers', () => {
    expect(normalizeUiZoom('abc')).toBe(100);
    expect(normalizeUiZoom(Number.NaN)).toBe(100);
    expect(normalizeUiZoom(Number.POSITIVE_INFINITY)).toBe(100);
    expect(normalizeUiZoom(undefined)).toBe(100);
    expect(normalizeUiZoom(null)).toBe(100);
  });
});

describe('stepUiZoom', () => {
  it('moves one level up or down', () => {
    expect(stepUiZoom(100, 1)).toBe(105);
    expect(stepUiZoom(100, -1)).toBe(95);
  });

  it('clamps at the smallest and largest level', () => {
    expect(stepUiZoom(UI_ZOOM_LEVELS[UI_ZOOM_LEVELS.length - 1], 1)).toBe(150);
    expect(stepUiZoom(150, 1)).toBe(150);
    expect(stepUiZoom(80, -1)).toBe(80);
  });

  it('steps from the nearest level for values that are not on the list', () => {
    expect(stepUiZoom(103, 1)).toBe(110);
    expect(stepUiZoom(103, -1)).toBe(100);
  });
});
