import i18n, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { UiLanguage } from '../../../shared/types/settings';
import { resources } from './resources';

export const supportedLanguages = ['en', 'sr-Latn', 'sr-Cyrl'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export function resolveUiLanguage(language: UiLanguage): SupportedLanguage {
  return language === 'system' ? 'en' : language;
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
