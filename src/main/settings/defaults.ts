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
    activeProviderId: 'openai',
    authModeByProvider: {},
    // whisper-1 is the only OpenAI transcription model with word timestamps.
    transcriptionModelByProvider: { openai: 'whisper-1' },
    textModelByProvider: { openai: 'gpt-4.1-mini' },
    defaultTargetLanguage: 'sr-Latn',
    autoDetectInputLanguage: true,
    conservativePolish: true,
    socialCaptionPolish: false,
    maxCharsPerLine: 42,
    maxLinesPerCaption: 2
  }
};
