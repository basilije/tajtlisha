import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { SubtitleOverlay } from '../../../src/renderer/src/components/preview';
import {
  buildSubtitleBlockStyle,
  buildSubtitleBoxStyle,
  buildSubtitleTextStyle,
  hexToRgba
} from '../../../src/renderer/src/components/preview/subtitleStyles';
import { computeSubtitleGeometry, DEFAULT_SUBTITLE_STYLE, SUBTITLE_PRESETS } from '../../../src/shared/subtitle-geometry';
import type { SubtitleStyle } from '../../../src/shared/types/style';
import { renderWithI18n } from '../renderWithI18n';

afterEach(() => cleanup());

const boxedStyle: SubtitleStyle = { ...DEFAULT_SUBTITLE_STYLE, backgroundEnabled: true, outlineEnabled: true };

describe('SubtitleOverlay', () => {
  it('sizes the font as a percentage of the displayed frame height', () => {
    const { container } = renderWithI18n(
      <SubtitleOverlay text="Hello" style={DEFAULT_SUBTITLE_STYLE} frameWidth={360} frameHeight={640} />
    );

    const block = container.querySelector<HTMLElement>('.subtitle-block');
    expect(block?.style.fontSize).toBe(`${(640 * DEFAULT_SUBTITLE_STYLE.fontSizePercent) / 100}px`);
    expect(block?.style.fontSize).toBe('28.8px');
  });

  it('keeps explicit line breaks in the text', () => {
    const { container } = renderWithI18n(
      <SubtitleOverlay text={'First line\nSecond line'} style={DEFAULT_SUBTITLE_STYLE} frameWidth={360} frameHeight={640} />
    );

    expect(container.querySelector('.subtitle-text')?.textContent).toBe('First line\nSecond line');
    expect(buildSubtitleTextStyle(DEFAULT_SUBTITLE_STYLE, computeSubtitleGeometry(DEFAULT_SUBTITLE_STYLE, 360, 640)).whiteSpace).toBe('pre');
  });

  it('renders nothing for empty text', () => {
    const { container } = renderWithI18n(
      <SubtitleOverlay text="   " style={DEFAULT_SUBTITLE_STYLE} frameWidth={360} frameHeight={640} />
    );

    expect(container.innerHTML).toBe('');
  });

  it('turns the outline off when the background box is on', () => {
    const geometry = computeSubtitleGeometry(boxedStyle, 360, 640);
    const text = buildSubtitleTextStyle(boxedStyle, geometry);

    expect(geometry.outlinePx).toBe(0);
    expect(text.WebkitTextStroke).toBeUndefined();
    expect(text.paintOrder).toBeUndefined();
  });

  it('draws the outline with a centered stroke and fill paint order when the box is off', () => {
    const geometry = computeSubtitleGeometry(DEFAULT_SUBTITLE_STYLE, 360, 640);
    const text = buildSubtitleTextStyle(DEFAULT_SUBTITLE_STYLE, geometry);

    expect(text.WebkitTextStroke).toBe(`${geometry.cssStrokeWidthPx}px #000000`);
    expect(text.paintOrder).toBe('stroke fill');
    expect(text.textShadow).toBe(`${geometry.shadowPx}px ${geometry.shadowPx}px 0 #000000`);
  });

  it('applies the box color with opacity and clone decoration breaks', () => {
    const geometry = computeSubtitleGeometry(boxedStyle, 360, 640);
    const box = buildSubtitleBoxStyle(boxedStyle, geometry);

    expect(box?.background).toBe('rgba(0, 0, 0, 0.6)');
    expect(box?.padding).toBe(`${geometry.boxPaddingPx}px`);
    expect(box?.boxDecorationBreak).toBe('clone');
    expect(buildSubtitleBoxStyle(DEFAULT_SUBTITLE_STYLE, computeSubtitleGeometry(DEFAULT_SUBTITLE_STYLE, 360, 640))).toBeUndefined();
  });

  it('places the block by position and keeps horizontal margins inside the frame', () => {
    const geometry = computeSubtitleGeometry(DEFAULT_SUBTITLE_STYLE, 360, 640);

    expect(buildSubtitleBlockStyle({ ...DEFAULT_SUBTITLE_STYLE, position: 'bottom' }, geometry).bottom).toBe(geometry.marginVerticalPx);
    expect(buildSubtitleBlockStyle({ ...DEFAULT_SUBTITLE_STYLE, position: 'top' }, geometry).top).toBe(geometry.marginVerticalPx);
    expect(buildSubtitleBlockStyle({ ...DEFAULT_SUBTITLE_STYLE, position: 'middle' }, geometry).transform).toBe('translateY(-50%)');
    expect(buildSubtitleBlockStyle(DEFAULT_SUBTITLE_STYLE, geometry).left).toBe(geometry.marginHorizontalPx);
    expect(buildSubtitleBlockStyle(DEFAULT_SUBTITLE_STYLE, geometry).textAlign).toBe('center');
  });

  it('converts hex colors to rgba and falls back to black for bad input', () => {
    expect(hexToRgba('#ffd84a', 0.5)).toBe('rgba(255, 216, 74, 0.5)');
    expect(hexToRgba('nope', 2)).toBe('rgba(0, 0, 0, 1)');
  });

  it('uses the same sizing for every preset', () => {
    for (const preset of Object.values(SUBTITLE_PRESETS)) {
      const geometry = computeSubtitleGeometry(preset, 360, 640);
      expect(buildSubtitleTextStyle(preset, geometry).fontSize).toBe(`${geometry.fontSizePx}px`);
    }
  });
});
