import type { AiProviderId, AuthMode } from './ai';
import type { ExportOverwritePolicy } from './export';

export type UiLanguage = 'system' | 'en' | 'sr-Latn' | 'sr-Cyrl';

export type ExportSettings = {
  exportOriginalSrt: boolean;
  exportTranslatedSrt: boolean;
  defaultBurnedInTrack: 'original' | 'translation';
  overwritePolicy: ExportOverwritePolicy;
  fileNamePattern: string;
};

export type AiConnectorSettings = {
  activeProviderId?: AiProviderId;
  authModeByProvider: Partial<Record<AiProviderId, AuthMode>>;
  transcriptionModelByProvider: Partial<Record<AiProviderId, string>>;
  textModelByProvider: Partial<Record<AiProviderId, string>>;
  defaultTargetLanguage?: string;
  autoDetectInputLanguage: boolean;
  conservativePolish: boolean;
  socialCaptionPolish: boolean;
  maxCharsPerLine: number;
  maxLinesPerCaption: 1 | 2;
};

export type AppSettings = {
  uiLanguage: UiLanguage;
  defaultOutputFolder?: string;
  workingFolder?: string;
  autosaveEnabled: boolean;
  recentFilesEnabled: boolean;
  neverModifyOriginalVideo: true;
  exportDefaults: ExportSettings;
  aiConnector: AiConnectorSettings;
};
