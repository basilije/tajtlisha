import type { UiLanguage } from '../shared/types/settings';

/**
 * Strings that only the main process shows (native dialogs). Renderer strings
 * live in src/renderer/src/i18n. Keep the three languages in step.
 */
export type MainLanguage = 'en' | 'sr-Latn' | 'sr-Cyrl';

const en = {
  exportConflictTitle: 'Output files already exist',
  exportConflictMessage: 'Some export files already exist. Replace them or create copies?',
  exportConflictReplace: 'Replace files',
  exportConflictCreateCopies: 'Create copies',
  exportConflictCancel: 'Cancel',
  selectVideoTitle: 'Open video',
  selectOutputFolderTitle: 'Choose export folder',
  videoFilterName: 'Video files'
};

export type MainStrings = Record<keyof typeof en, string>;

const MAIN_STRINGS: Record<MainLanguage, MainStrings> = {
  en,
  'sr-Latn': {
    exportConflictTitle: 'Izlazni fajlovi već postoje',
    exportConflictMessage: 'Neki izlazni fajlovi već postoje. Da li da ih zamenim ili da napravim kopije?',
    exportConflictReplace: 'Zameni fajlove',
    exportConflictCreateCopies: 'Napravi kopije',
    exportConflictCancel: 'Otkaži',
    selectVideoTitle: 'Otvori video',
    selectOutputFolderTitle: 'Izaberi folder za izvoz',
    videoFilterName: 'Video fajlovi'
  },
  'sr-Cyrl': {
    exportConflictTitle: 'Излазни фајлови већ постоје',
    exportConflictMessage: 'Неки излазни фајлови већ постоје. Да ли да их заменим или да направим копије?',
    exportConflictReplace: 'Замени фајлове',
    exportConflictCreateCopies: 'Направи копије',
    exportConflictCancel: 'Откажи',
    selectVideoTitle: 'Отвори видео',
    selectOutputFolderTitle: 'Изабери фолдер за извоз',
    videoFilterName: 'Видео фајлови'
  }
};

/**
 * Resolves the UI language for main. 'system' follows the OS locale: Serbian,
 * Croatian and Bosnian map to Latin unless the locale names Cyrillic; anything
 * else falls back to English.
 */
export function resolveMainLanguage(uiLanguage: UiLanguage, systemLocale: string): MainLanguage {
  if (uiLanguage !== 'system') return uiLanguage;
  if (/^(sr|hr|bs)([-_@.]|$)/i.test(systemLocale)) {
    return /cyrl/i.test(systemLocale) ? 'sr-Cyrl' : 'sr-Latn';
  }
  return 'en';
}

export function mainStringsFor(language: MainLanguage): MainStrings {
  return MAIN_STRINGS[language];
}
