import type { SubtitleTrack, TranscriptSegment } from './subtitles';

export type AiProviderId = 'openai' | 'openrouter';

export type AuthMode = 'api_key' | 'codex_auth_experimental';

export type AiProviderCapabilities = {
  detectLanguage: boolean;
  transcription: boolean;
  segmentTimestamps: boolean;
  wordTimestamps: boolean;
  translation: boolean;
  subtitlePolish: boolean;
  textToSpeech: boolean;
};

export type ProviderSummary = {
  id: AiProviderId;
  displayName: string;
  authModes: AuthMode[];
  capabilities: AiProviderCapabilities;
};

export type ProviderStatus = ProviderSummary & {
  connected: boolean;
  activeAuthMode?: AuthMode;
  maskedCredential?: string;
  lastCheckedAt?: string;
  message?: string;
};

export type ProviderModelDescriptor = {
  id: string;
  label: string;
  capability: keyof AiProviderCapabilities;
  available?: boolean;
};

export type TestConnectionResult = {
  ok: boolean;
  providerId: AiProviderId;
  message?: string;
  checkedAt: string;
};

export type ConnectProviderInput = {
  providerId: AiProviderId;
  authMode: AuthMode;
  secret?: string;
};

export type TranscriptionRequest = {
  audioPath: string;
  audioFormat: 'wav' | 'mp3' | 'm4a';
  modelId?: string;
  expectedLanguage?: string;
  autoDetectLanguage: boolean;
  clipDurationMs: number;
};

export type TranscriptionResult = {
  detectedLanguage: string;
  text: string;
  segments: TranscriptSegment[];
  providerMetadata?: unknown;
};

export type TranslationRequest = {
  sourceLanguage: string;
  targetLanguage: string;
  modelId?: string;
  segments: TranscriptSegment[];
  preserveTiming: true;
};

export type SubtitlePolishRequest = {
  track: SubtitleTrack;
  modelId?: string;
  mode: 'conservative' | 'social_caption';
  maxCharsPerLine: number;
  maxLinesPerCaption: 1 | 2;
};

export type GenerateSubtitlesRequest = {
  inputPath: string;
  knownDurationMs?: number;
  trim?: {
    startMs: number;
    endMs: number;
    knownDurationMs?: number;
  };
  providerId: AiProviderId;
  transcriptionModelId?: string;
  textModelId?: string;
  expectedLanguage?: string;
  autoDetectLanguage: boolean;
  targetLanguage: string;
  polish: boolean;
  polishMode: SubtitlePolishRequest['mode'];
  maxCharsPerLine: number;
  maxLinesPerCaption: 1 | 2;
};

export type GenerateSubtitlesResult = {
  originalTrack: SubtitleTrack;
  translatedTrack: SubtitleTrack;
};
