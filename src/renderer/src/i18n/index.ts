import i18n, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { UiLanguage } from '../../../shared/types/settings';
import { resources } from './resources';

export const supportedLanguages = ['en', 'sr-Latn', 'sr-Cyrl'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

// Serbian-family tags that should get the Latin UI. Bare `sr` and `sr-RS`/`sr-ME`
// are listed explicitly; `hr`, `bs` and `sh` are matched by primary subtag.
const latinSerbianTags = ['sr', 'sr-rs', 'sr-me'];
const latinPrimaryLanguages = ['hr', 'bs', 'sh'];

export function resolveUiLanguage(
  language: UiLanguage,
  systemLanguages: readonly string[] = readNavigatorLanguages()
): SupportedLanguage {
  return language === 'system' ? resolveSystemLanguage(systemLanguages) : language;
}

export function resolveSystemLanguage(systemLanguages: readonly string[]): SupportedLanguage {
  for (const language of systemLanguages) {
    const match = matchSupportedLanguage(language);

    if (match) {
      return match;
    }
  }

  return 'en';
}

function matchSupportedLanguage(language: string): SupportedLanguage | undefined {
  const tag = language.toLowerCase();
  const [primary] = tag.split('-');

  if (hasSubtag(tag, 'sr-cyrl')) {
    return 'sr-Cyrl';
  }

  if (hasSubtag(tag, 'sr-latn') || latinSerbianTags.includes(tag) || latinPrimaryLanguages.includes(primary)) {
    return 'sr-Latn';
  }

  return undefined;
}

function hasSubtag(tag: string, prefix: string): boolean {
  return tag === prefix || tag.startsWith(`${prefix}-`);
}

function readNavigatorLanguages(): readonly string[] {
  return typeof navigator === 'undefined' ? [] : navigator.languages;
}

export function createI18n(initialLanguage: UiLanguage = 'en'): I18nInstance {
  const instance = i18n.createInstance();

  void instance.use(initReactI18next).init({
    resources,
    lng: resolveUiLanguage(initialLanguage),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    },
    react: {
      useSuspense: false
    }
  });

  return instance;
}

export const defaultI18n = createI18n();
