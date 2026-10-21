import type { CSSProperties } from 'react';
import type { SubtitleGeometry } from '../../../../shared/subtitle-geometry';
import type { SubtitleStyle } from '../../../../shared/types/style';

/**
 * Maps a subtitle style plus its geometry to CSS. The overlay and the style
 * drawer's preset samples both use these, so they render the same look.
 * Rules come from the header of src/shared/subtitle-geometry.ts.
 */

/** `#rrggbb` plus alpha to `rgba(...)`. Falls back to black for malformed input. */
export function hexToRgba(hex: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  const digits = match ? match[1] : '000000';
  const red = parseInt(digits.slice(0, 2), 16);
  const green = parseInt(digits.slice(2, 4), 16);
  const blue = parseInt(digits.slice(4, 6), 16);
  const clampedAlpha = Math.min(1, Math.max(0, alpha));
  return `rgba(${red}, ${green}, ${blue}, ${clampedAlpha})`;
}

/** Text appearance: font, size, weight, color, outline and shadow. */
export function buildSubtitleTextStyle(style: SubtitleStyle, geometry: SubtitleGeometry): CSSProperties {
  const outlined = geometry.outlinePx > 0;
  const shadowed = geometry.shadowPx > 0;

  return {
    fontFamily: `'${style.fontFamily}', ui-sans-serif, system-ui, sans-serif`,
    fontSize: `${geometry.fontSizePx}px`,
    lineHeight: `${geometry.lineHeightPx}px`,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? 'italic' : 'normal',
    whiteSpace: 'pre',
    color: style.textColor,
    WebkitTextStroke: outlined ? `${geometry.cssStrokeWidthPx}px ${style.outlineColor}` : undefined,
    paintOrder: outlined ? 'stroke fill' : undefined,
    textShadow: shadowed
      ? `${geometry.shadowPx}px ${geometry.shadowPx}px 0 ${style.shadowColor}`
      : undefined
  };
}

/** Background box, drawn per line fragment so every explicit line gets its own box. */
export function buildSubtitleBoxStyle(style: SubtitleStyle, geometry: SubtitleGeometry): CSSProperties | undefined {
  if (!style.backgroundEnabled) return undefined;

  return {
    background: hexToRgba(style.backgroundColor, style.backgroundOpacity),
    padding: `${geometry.boxPaddingPx}px`,
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone'
  };
}

/** Position, alignment and margins of the caption block, plus the text appearance it carries. */
export function buildSubtitleBlockStyle(style: SubtitleStyle, geometry: SubtitleGeometry): CSSProperties {
  const placement: CSSProperties =
    style.position === 'top'
      ? { top: geometry.marginVerticalPx }
      : style.position === 'bottom'
        ? { bottom: geometry.marginVerticalPx }
        : { top: '50%', transform: 'translateY(-50%)' };

  return {
    ...buildSubtitleTextStyle(style, geometry),
    ...placement,
    position: 'absolute',
    left: geometry.marginHorizontalPx,
    right: geometry.marginHorizontalPx,
    textAlign: style.align
  };
}
