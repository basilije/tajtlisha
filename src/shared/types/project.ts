import type { SubtitleStyle } from './style';

/**
 * One caption = one shared timing pair with the original text and its
 * translation. Times are absolute positions in the SOURCE video (not trimmed
 * timeline). Export shifts them so the trimmed output starts at 00:00:00.
 */
export type CaptionRow = {
  id: string;
  startMs: number;
  endMs: number;
  /** Text in the spoken language. May contain '\n' for explicit line breaks. */
  original: string;
  /** Translated text. Empty string means "not translated yet". May contain '\n'. */
  translation: string;
};

export type ProjectSource = {
  inputPath: string;
  /** Ephemeral playback URL (tajtlisha-media://...). Regenerated on every load; never trust a persisted value. */
  fileUrl: string;
  durationMs: number;
  /** Display width/height in pixels (rotation already applied). */
  width: number;
  height: number;
  hasAudio: boolean;
};

export type TrimRange = {
  /** Source-absolute start, inclusive. */
  startMs: number;
  /** Source-absolute end, exclusive. Always > startMs. */
  endMs: number;
};

export type PreviewTrack = 'original' | 'translation';

export type ProjectDocument = {
  schemaVersion: 1;
  id: string;
  source: ProjectSource | null;
  trim: TrimRange;
  /** Language code of the spoken audio (detected or chosen), e.g. 'en'. Undefined until known. */
  sourceLanguage?: string;
  /** Target translation language code, e.g. 'sr-Latn'. */
  targetLanguage: string;
  /** Sorted by startMs, non-overlapping when valid. */
  captions: CaptionRow[];
  style: SubtitleStyle;
  /** Which text is shown in the preview and burned into the video by default. */
  previewTrack: PreviewTrack;
  /** ISO timestamp of the last modification. */
  updatedAt: string;
};

/** Languages offered in the UI for source/target selection. Codes are what AI providers receive. */
export const PROJECT_LANGUAGES = [
  'en',
  'sr-Latn',
  'sr-Cyrl',
  'hr',
  'bs',
  'sl',
  'mk',
  'de',
  'fr',
  'es',
  'it',
  'pt',
  'ru',
  'uk',
  'pl',
  'tr'
] as const;
