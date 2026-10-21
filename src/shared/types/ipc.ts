import type {
  AiProviderCapabilities,
  AiProviderId,
  ConnectProviderInput,
  GenerateSubtitlesRequest,
  GenerateSubtitlesResult,
  ProviderModelDescriptor,
  ProviderStatus,
  ProviderSummary,
  SubtitlePolishRequest,
  TestConnectionResult,
  TranscriptionRequest,
  TranscriptionResult,
  TranslationRequest
} from './ai';
import type {
  BurnSubtitlesRequest,
  BurnSubtitlesResult,
  ExportProjectRequest,
  ExportProjectResult,
  SelectOutputFolderResult,
  WriteSrtRequest,
  WriteSrtResult
} from './export';
import type {
  AudioExtractRequest,
  AudioExtractResult,
  CreatePreviewProxyRequest,
  CreatePreviewProxyResult,
  FfmpegStatus,
  MediaProbeRequest,
  MediaProbeResult,
  SelectVideoResult,
  TrimRequest,
  TrimResult
} from './media';
import type { AppSettings } from './settings';
import type { SubtitleTrack } from './subtitles';

export type TajtlishaApi = {
  settings: {
    get(): Promise<AppSettings>;
    update(patch: Partial<AppSettings>): Promise<AppSettings>;
    reset(): Promise<AppSettings>;
  };
  ai: {
    listProviders(): Promise<ProviderSummary[]>;
    getProviderStatus(providerId: AiProviderId): Promise<ProviderStatus>;
    connectProvider(input: ConnectProviderInput): Promise<ProviderStatus>;
    disconnectProvider(providerId: AiProviderId): Promise<ProviderStatus>;
    testConnection(providerId: AiProviderId): Promise<TestConnectionResult>;
    listModels(providerId: AiProviderId, capability: keyof AiProviderCapabilities): Promise<ProviderModelDescriptor[]>;
    transcribe(providerId: AiProviderId, request: TranscriptionRequest): Promise<TranscriptionResult>;
    translate(providerId: AiProviderId, request: TranslationRequest): Promise<SubtitleTrack>;
    polishSubtitles(providerId: AiProviderId, request: SubtitlePolishRequest): Promise<SubtitleTrack>;
    generateSubtitles(request: GenerateSubtitlesRequest): Promise<GenerateSubtitlesResult>;
  };
  media: {
    selectVideo(): Promise<SelectVideoResult>;
    createPreviewProxy(input: CreatePreviewProxyRequest): Promise<CreatePreviewProxyResult>;
    getFfmpegStatus(): Promise<FfmpegStatus>;
    probe(input: MediaProbeRequest): Promise<MediaProbeResult>;
    trim(input: TrimRequest): Promise<TrimResult>;
    extractAudio(input: AudioExtractRequest): Promise<AudioExtractResult>;
  };
  export: {
    selectOutputFolder(): Promise<SelectOutputFolderResult>;
    writeSrt(input: WriteSrtRequest): Promise<WriteSrtResult>;
    burnSubtitles(input: BurnSubtitlesRequest): Promise<BurnSubtitlesResult>;
    exportProject(input: ExportProjectRequest): Promise<ExportProjectResult>;
  };
};
