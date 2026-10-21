import type { SubtitlePresetId, SubtitleStyle } from './types/style';

/**
 * Single source of truth for subtitle layout. Both the renderer preview (CSS)
 * and the ASS export call this with the frame size they render into, so the
 * text keeps the same proportions on screen and in the exported video.
 */
export type SubtitleGeometry = {
  /** Font size in pixels of the given frame. */
  fontSizePx: number;
  /** Outline thickness in pixels (0 when disabled or when the box is enabled). */
  outlinePx: number;
  /** Shadow offset in pixels (0 when disabled). */
  shadowPx: number;
  /** Padding around text when the background box is enabled. */
  boxPaddingPx: number;
  /** Distance from the top or bottom edge, in pixels. Unused for `middle`. */
  marginVerticalPx: number;
  /** Left and right margin, in pixels, derived from maxWidthPercent. */
  marginHorizontalPx: number;
};

export function computeSubtitleGeometry(style: SubtitleStyle, frameWidth: number, frameHeight: number): SubtitleGeometry {
  const width = Math.max(1, frameWidth);
  const height = Math.max(1, frameHeight);
  const fontSizePx = (height * clamp(style.fontSizePercent, 2, 12)) / 100;
  const outlinePx =
    style.outlineEnabled && !style.backgroundEnabled ? (fontSizePx * clamp(style.outlineWidthPercent, 0, 20)) / 100 : 0;

  return {
    fontSizePx,
    outlinePx,
    shadowPx: style.shadowEnabled ? fontSizePx * 0.06 : 0,
    boxPaddingPx: style.backgroundEnabled ? fontSizePx * 0.18 : 0,
    marginVerticalPx: (height * clamp(style.marginVerticalPercent, 0, 30)) / 100,
    marginHorizontalPx: (width * (100 - clamp(style.maxWidthPercent, 40, 100))) / 200
  };
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  presetId: 'clean',
  fontFamily: 'Noto Sans',
  fontSizePercent: 4.5,
  bold: true,
  italic: false,
  textColor: '#ffffff',
  outlineEnabled: true,
  outlineColor: '#000000',
  outlineWidthPercent: 9,
  shadowEnabled: true,
  shadowColor: '#000000',
  backgroundEnabled: false,
  backgroundColor: '#000000',
  backgroundOpacity: 0.6,
  position: 'bottom',
  align: 'center',
  marginVerticalPercent: 12,
  maxWidthPercent: 86
};

export const SUBTITLE_PRESETS: Record<SubtitlePresetId, SubtitleStyle> = {
  clean: DEFAULT_SUBTITLE_STYLE,
  box: {
    ...DEFAULT_SUBTITLE_STYLE,
    presetId: 'box',
    bold: false,
    outlineEnabled: false,
    shadowEnabled: false,
    backgroundEnabled: true,
    backgroundColor: '#000000',
    backgroundOpacity: 0.65
  },
  bold_yellow: {
    ...DEFAULT_SUBTITLE_STYLE,
    presetId: 'bold_yellow',
    fontSizePercent: 5.2,
    textColor: '#ffd84a',
    outlineWidthPercent: 11
  }
};
