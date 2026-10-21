import {
  DEFAULT_SUBTITLE_STYLE,
  SUBTITLE_PRESETS,
  assFontSize,
  computeSubtitleGeometry,
  effectiveMaxCharsPerLine,
  estimateMaxCharsPerLine
} from '../../../src/shared/subtitle-geometry';

describe('subtitle geometry', () => {
  it('scales with the shorter side and converts to libass font size', () => {
    const geometry = computeSubtitleGeometry(DEFAULT_SUBTITLE_STYLE, 720, 1280);
    expect(geometry.fontSizePx).toBeCloseTo(39.6);
    expect(computeSubtitleGeometry(DEFAULT_SUBTITLE_STYLE, 1920, 1080).fontSizePx).toBeCloseTo(59.4);
    expect(assFontSize(DEFAULT_SUBTITLE_STYLE, geometry)).toBe(60.2);
    expect(geometry.cssStrokeWidthPx).toBeCloseTo(geometry.outlinePx * 2);
  });

  it('fits about 29 characters per line on a vertical 720x1280 clip', () => {
    const chars = estimateMaxCharsPerLine(DEFAULT_SUBTITLE_STYLE, 720, 1280);
    expect(chars).toBeGreaterThanOrEqual(27);
    expect(chars).toBeLessThanOrEqual(31);
    // The line that overflowed in the export check must not fit.
    expect('Više vremena trošiš na interfejs'.length).toBeGreaterThan(chars);
  });

  it('lets the user setting cap wide frames', () => {
    expect(effectiveMaxCharsPerLine(42, DEFAULT_SUBTITLE_STYLE, 1920, 1080)).toBe(42);
    expect(effectiveMaxCharsPerLine(42, SUBTITLE_PRESETS.box, 720, 1280)).toBeLessThan(42);
  });
});
