import type { AppSettings } from '../../shared/types/settings';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  uiLanguage: 'system',
  autosaveEnabled: true,
  recentFilesEnabled: true,
  neverModifyOriginalVideo: true,
  exportDefaults: {
    exportOriginalSrt: true,
    exportTranslatedSrt: true,
    defaultBurnedInTrack: 'translation',
    overwritePolicy: 'ask',
    fileNamePattern: '{name}.{track}'
  },
  aiConnector: {
    authModeByProvider: {},
    transcriptionModelByProvider: {},
    textModelByProvider: {},
    autoDetectInputLanguage: true,
    conservativePolish: true,
    socialCaptionPolish: false,
    maxCharsPerLine: 42,
    maxLinesPerCaption: 2
  }
};
