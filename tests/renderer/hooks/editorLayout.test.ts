import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_EDITOR_LAYOUT,
  EDITOR_LAYOUT_STORAGE_KEY,
  MIN_CAPTIONS_PX,
  MIN_PREVIEW_PX,
  MIN_STYLE_DRAWER_PX,
  SPLITTER_PX,
  captionsFractionFor,
  captionsWidthBounds,
  captionsWidthPx,
  clampStyleDrawerPx,
  loadEditorLayout,
  parseEditorLayout,
  saveEditorLayout,
  styleDrawerBounds,
  styleDrawerPx
} from '../../../src/renderer/src/hooks/editorLayout';

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(EDITOR_LAYOUT_STORAGE_KEY, initial);
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    })
  };
}

describe('captions width', () => {
  it('uses the default fraction of the usable width', () => {
    // 1000 px window: 988 px for the columns after the 12 px splitter.
    expect(captionsWidthPx(0.58, 1000)).toBe(Math.round(0.58 * (1000 - SPLITTER_PX)));
  });

  it('never goes below the captions minimum or above the preview minimum', () => {
    expect(captionsWidthPx(0.05, 1000)).toBe(MIN_CAPTIONS_PX);
    expect(captionsWidthPx(0.95, 1000)).toBe(1000 - SPLITTER_PX - MIN_PREVIEW_PX);
  });

  it('keeps the stored fraction when the window shrinks and grows again', () => {
    const fraction = 0.58;
    expect(captionsWidthPx(fraction, 1000)).toBe(573);
    expect(captionsWidthPx(fraction, 700)).toBe(368);
    expect(captionsWidthPx(fraction, 1000)).toBe(573);
  });

  it('shrinks the captions minimum when the window cannot fit both minimums', () => {
    const bounds = captionsWidthBounds(700);
    expect(bounds.max).toBe(700 - SPLITTER_PX - MIN_PREVIEW_PX);
    expect(bounds.min).toBe(bounds.max);
    expect(bounds.min).toBeLessThan(MIN_CAPTIONS_PX);
    // The preview keeps its minimum: the captions column takes the rest.
    expect(700 - SPLITTER_PX - captionsWidthPx(0.9, 700)).toBe(MIN_PREVIEW_PX);
  });

  it('stores a dragged width as a fraction that reads back as the same width', () => {
    const fraction = captionsFractionFor(600, 1000);
    expect(fraction).toBeCloseTo(600 / (1000 - SPLITTER_PX));
    expect(captionsWidthPx(fraction, 1000)).toBe(600);
  });

  it('clamps a dragged width before storing it', () => {
    expect(captionsWidthPx(captionsFractionFor(10, 1000), 1000)).toBe(MIN_CAPTIONS_PX);
    expect(captionsWidthPx(captionsFractionFor(5000, 1000), 1000)).toBe(1000 - SPLITTER_PX - MIN_PREVIEW_PX);
  });

  it('falls back to the default fraction when the width is not measured', () => {
    expect(captionsFractionFor(600, 0)).toBe(DEFAULT_EDITOR_LAYOUT.captionsFraction);
  });
});

describe('style drawer height', () => {
  it('defaults to 40% of the column height when no size is stored', () => {
    expect(styleDrawerPx(null, 1000)).toBe(400);
  });

  it('keeps the video area above the splitter at its minimum', () => {
    const bounds = styleDrawerBounds(1000);
    expect(bounds.max).toBe(1000 - 220 - SPLITTER_PX);
    expect(styleDrawerPx(5000, 1000)).toBe(bounds.max);
    expect(clampStyleDrawerPx(500, 600)).toBe(368);
  });

  it('keeps the drawer at its minimum in a short column', () => {
    expect(styleDrawerPx(10, 1000)).toBe(MIN_STYLE_DRAWER_PX);
    expect(styleDrawerPx(null, 300)).toBe(MIN_STYLE_DRAWER_PX);
    expect(styleDrawerBounds(300)).toEqual({ min: MIN_STYLE_DRAWER_PX, max: MIN_STYLE_DRAWER_PX });
  });
});

describe('stored editor layout', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(parseEditorLayout(null)).toEqual(DEFAULT_EDITOR_LAYOUT);
    expect(loadEditorLayout(memoryStorage())).toEqual(DEFAULT_EDITOR_LAYOUT);
  });

  it('keeps valid values', () => {
    const raw = JSON.stringify({ captionsFraction: 0.4, styleDrawerPx: 320 });
    expect(parseEditorLayout(raw)).toEqual({ captionsFraction: 0.4, styleDrawerPx: 320 });
  });

  it.each([
    ['not JSON', 'not json'],
    ['an array', '[1, 2]'],
    ['a string', '"layout"'],
    ['null', 'null'],
    ['a wrong type', '{"captionsFraction":"0.7","styleDrawerPx":"300"}'],
    ['an out-of-range fraction', '{"captionsFraction":1.5,"styleDrawerPx":null}'],
    ['a negative drawer height', '{"captionsFraction":0.5,"styleDrawerPx":-3}'],
    ['a drawer height above the sanity cap', '{"captionsFraction":0.5,"styleDrawerPx":1e9}'],
    ['a non-finite value', '{"captionsFraction":1e999,"styleDrawerPx":300}']
  ])('falls back per field for %s', (_label, raw) => {
    const parsed = parseEditorLayout(raw);
    expect(Number.isFinite(parsed.captionsFraction)).toBe(true);
    expect(parsed.captionsFraction).toBeGreaterThanOrEqual(0);
    expect(parsed.captionsFraction).toBeLessThanOrEqual(1);
    expect(parsed.styleDrawerPx === null || parsed.styleDrawerPx > 0).toBe(true);
  });

  it('replaces only the bad field', () => {
    expect(parseEditorLayout('{"captionsFraction":2,"styleDrawerPx":280}')).toEqual({
      captionsFraction: DEFAULT_EDITOR_LAYOUT.captionsFraction,
      styleDrawerPx: 280
    });
    expect(parseEditorLayout('{"captionsFraction":0.5,"styleDrawerPx":"tall"}')).toEqual({
      captionsFraction: 0.5,
      styleDrawerPx: null
    });
  });

  it('gives the defaults when storage throws', () => {
    const storage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined
    };
    expect(loadEditorLayout(storage)).toEqual(DEFAULT_EDITOR_LAYOUT);
    expect(loadEditorLayout(undefined)).toEqual(DEFAULT_EDITOR_LAYOUT);
  });

  it('writes only the two layout fields under the versioned key', () => {
    const storage = memoryStorage();
    saveEditorLayout(storage, { captionsFraction: 0.5, styleDrawerPx: null });

    expect(storage.setItem).toHaveBeenCalledWith(EDITOR_LAYOUT_STORAGE_KEY, expect.any(String));
    expect(JSON.parse(storage.values.get(EDITOR_LAYOUT_STORAGE_KEY) ?? 'null')).toEqual({
      captionsFraction: 0.5,
      styleDrawerPx: null
    });
  });

  it('round-trips a saved layout', () => {
    const storage = memoryStorage();
    saveEditorLayout(storage, { captionsFraction: 0.61, styleDrawerPx: 355 });
    expect(loadEditorLayout(storage)).toEqual({ captionsFraction: 0.61, styleDrawerPx: 355 });
  });

  it('ignores a failing write', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      }
    };
    expect(() => saveEditorLayout(storage, DEFAULT_EDITOR_LAYOUT)).not.toThrow();
  });
});
