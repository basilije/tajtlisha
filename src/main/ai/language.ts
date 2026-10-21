/** Project language codes (see PROJECT_LANGUAGES) mapped to names used in prompts. */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  'sr-Latn': 'Serbian (Latin script)',
  'sr-Cyrl': 'Serbian (Cyrillic script)',
  hr: 'Croatian',
  bs: 'Bosnian',
  sl: 'Slovenian',
  mk: 'Macedonian',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  uk: 'Ukrainian',
  pl: 'Polish',
  tr: 'Turkish'
};

/** Names Whisper returns in verbose_json (for example "english") mapped to project codes. */
const SPOKEN_LANGUAGE_NAMES: Record<string, string> = {
  english: 'en',
  serbian: 'sr-Latn',
  croatian: 'hr',
  bosnian: 'bs',
  slovenian: 'sl',
  macedonian: 'mk',
  german: 'de',
  french: 'fr',
  spanish: 'es',
  italian: 'it',
  portuguese: 'pt',
  russian: 'ru',
  ukrainian: 'uk',
  polish: 'pl',
  turkish: 'tr',
  arabic: 'ar',
  chinese: 'zh',
  japanese: 'ja',
  korean: 'ko',
  hindi: 'hi',
  dutch: 'nl',
  swedish: 'sv',
  norwegian: 'no',
  danish: 'da',
  finnish: 'fi',
  czech: 'cs',
  greek: 'el',
  hungarian: 'hu',
  romanian: 'ro',
  bulgarian: 'bg'
};

export function languageDisplayName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

/**
 * ISO 639-1 code sent to transcription APIs. Script variants collapse to the
 * base language because transcription APIs do not take a script.
 */
export function transcriptionLanguageCode(code: string | undefined): string | undefined {
  if (!code || code === 'und') return undefined;
  return code.split('-')[0].toLowerCase();
}

/** Maps a spoken-language name from a provider response to a project code, or 'und'. */
export function languageCodeFromSpokenName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const normalized = name.trim().toLowerCase();
  return SPOKEN_LANGUAGE_NAMES[normalized] ?? (/^[a-z]{2,3}$/.test(normalized) ? normalized : undefined);
}
