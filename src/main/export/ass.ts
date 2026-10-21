import { AppError } from '../../shared/errors';
import { assFontSize, clamp, computeSubtitleGeometry } from '../../shared/subtitle-geometry';
import type { SubtitleStyle } from '../../shared/types/style';

export type AssCaption = {
  startMs: number;
  endMs: number;
  text: string;
};

export type BuildAssDocumentInput = {
  captions: readonly AssCaption[];
  style: SubtitleStyle;
  videoWidth: number;
  videoHeight: number;
};

const ASS_STYLE_FORMAT =
  'Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding';

const ASS_EVENT_FORMAT = 'Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text';

/** Shadow alpha used when the text has a drop shadow (ASS alpha: 00 opaque, FF transparent). */
const SHADOW_ALPHA = '60';

/**
 * Builds an ASS document whose PlayRes equals the video size. Every pixel value
 * comes from `computeSubtitleGeometry`, the same function the editor preview uses.
 */
export function buildAssDocument(input: BuildAssDocumentInput): string {
  const width = Math.round(input.videoWidth);
  const height = Math.round(input.videoHeight);
  const geometry = computeSubtitleGeometry(input.style, width, height);
  const style = input.style;
  const boxed = style.backgroundEnabled;

  const outlineColour = boxed
    ? `&H${alphaByte(1 - clamp(style.backgroundOpacity, 0, 1))}${bgrHex(style.backgroundColor)}`
    : `&H00${bgrHex(style.outlineColor)}`;
  const backColour = boxed ? outlineColour : `&H${SHADOW_ALPHA}${bgrHex(style.shadowColor)}`;

  const styleLine = [
    'Default',
    style.fontFamily.replace(/,/g, ''),
    assFontSize(style, geometry).toFixed(1),
    `&H00${bgrHex(style.textColor)}`,
    '&H000000FF',
    outlineColour,
    backColour,
    style.bold ? '-1' : '0',
    style.italic ? '-1' : '0',
    '0',
    '0',
    '100',
    '100',
    '0',
    '0',
    boxed ? '3' : '1',
    boxed ? `${Math.round(geometry.boxPaddingPx)}` : geometry.outlinePx.toFixed(1),
    boxed ? '0' : geometry.shadowPx.toFixed(1),
    `${alignment(style)}`,
    `${Math.round(geometry.marginHorizontalPx)}`,
    `${Math.round(geometry.marginHorizontalPx)}`,
    `${Math.round(geometry.marginVerticalPx)}`,
    '1'
  ];

  const events = input.captions
    .filter((caption) => caption.text.replace(/\r/g, '').trim().length > 0)
    .map(
      (caption) =>
        `Dialogue: 0,${formatAssTimestamp(caption.startMs)},${formatAssTimestamp(caption.endMs)},Default,,0,0,0,,${escapeAssText(caption.text)}`
    );

  return [
    '[Script Info]',
    'Title: Tajtlisha export',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    // Explicit '\N' breaks only, matching the CSS preview (white-space: pre).
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: None',
    '',
    '[V4+ Styles]',
    `Format: ${ASS_STYLE_FORMAT}`,
    `Style: ${styleLine.join(',')}`,
    '',
    '[Events]',
    `Format: ${ASS_EVENT_FORMAT}`,
    ...events,
    ''
  ].join('\n');
}

/** H:MM:SS.cc with centiseconds, as ASS requires. */
export function formatAssTimestamp(ms: number): string {
  const centiseconds = Math.max(0, Math.round(ms / 10));
  const hours = Math.floor(centiseconds / 360_000);
  const minutes = Math.floor((centiseconds % 360_000) / 6000);
  const seconds = Math.floor((centiseconds % 6000) / 100);
  const hundredths = centiseconds % 100;

  return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(hundredths)}`;
}

/**
 * Keeps user text from being read as ASS markup: braces would start override
 * tags, a backslash would start an escape, and '\n' becomes the ASS line break.
 */
export function escapeAssText(text: string): string {
  return text
    .replace(/\r/g, '')
    .trim()
    .replace(/\\/g, '⧵')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
    .replace(/\n/g, '\\N');
}

/** Numpad alignment: bottom 1-3, middle 4-6, top 7-9 for left, center, right. */
function alignment(style: SubtitleStyle): number {
  const column = style.align === 'left' ? 1 : style.align === 'right' ? 3 : 2;
  const row = style.position === 'top' ? 7 : style.position === 'middle' ? 4 : 1;
  return row + column - 1;
}

/** '#rrggbb' to 'BBGGRR' (ASS stores colours blue first). */
function bgrHex(hex: string): string {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) {
    throw new AppError('UNKNOWN', `Invalid subtitle colour "${hex}".`);
  }

  const rgb = match[1];
  return `${rgb.slice(4, 6)}${rgb.slice(2, 4)}${rgb.slice(0, 2)}`.toUpperCase();
}

/** Transparency 0..1 (1 = fully transparent) as the two-digit ASS alpha. */
function alphaByte(transparency: number): string {
  return Math.round(clamp(transparency, 0, 1) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
