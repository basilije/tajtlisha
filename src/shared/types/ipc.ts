import type {
  AiProviderCapabilities,
  AiProviderId,
  ConnectProviderInput,
  ProviderModelDescriptor,
  ProviderStatus,
  ProviderSummary,
  TestConnectionResult
} from './ai';
import type { SelectOutputFolderResult } from './export';
import type {
  JobProgressEvent,
  ProjectExportRequest,
  ProjectExportResult,
  TranscribeClipRequest,
  TranscribeClipResult,
  TranslateCaptionsRequest,
  TranslateCaptionsResult
} from './jobs';
import type { FfmpegStatus } from './media';
import type { ProjectDocument, ProjectLoadResult, ProjectSource } from './project';
import type { SubtitleStyle } from './style';
import type { AppSettings } from './settings';
import type { UpdateState } from './updates';

/**
 * IPC channel names. Main registers handlers for exactly these, preload
 * forwards exactly these. Keep in sync with TajtlishaApi below.
 */
export const IPC_CHANNELS = {
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsReset: 'settings:reset',

  aiListProviders: 'ai:listProviders',
  aiGetProviderStatus: 'ai:getProviderStatus',
  aiConnectProvider: 'ai:connectProvider',
  aiDisconnectProvider: 'ai:disconnectProvider',
  aiTestConnection: 'ai:testConnection',
  aiListModels: 'ai:listModels',

  projectSelectVideo: 'project:selectVideo',
  projectLoadLast: 'project:loadLast',
  projectSave: 'project:save',
  projectCreatePreviewProxy: 'project:createPreviewProxy',
  projectRenderPreviewFrame: 'project:renderPreviewFrame',

  workflowTranscribe: 'workflow:transcribe',
  workflowTranslate: 'workflow:translate',

  jobsCancel: 'jobs:cancel',
  /** main -> renderer event, payload JobProgressEvent */
  jobsProgress: 'jobs:progress',

  exportSelectOutputFolder: 'export:selectOutputFolder',
  exportProject: 'export:project',
  exportShowInFolder: 'export:showInFolder',

  mediaGetFfmpegStatus: 'media:getFfmpegStatus',

  updatesGetState: 'updates:getState',
  updatesCheck: 'updates:check',
  updatesDownload: 'updates:download',
  updatesInstall: 'updates:install',
  /** main -> renderer event, payload UpdateState */
  updatesState: 'updates:state',

  appGetInfo: 'app:getInfo'
} as const;

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
  };
  project: {
    /** Opens a file dialog and probes the video. Null when canceled. */
    selectVideo(): Promise<ProjectSource | null>;
    /**
     * Last opened project, or null when none was saved. Returned even when the
     * source video is missing so captions are never lost (relink via selectVideo).
     */
    loadLast(): Promise<ProjectLoadResult | null>;
    /**
     * Persists the project to userData/projects/<id>.json (temp file + rename),
     * serialized in main. Saves older than the last saved revision are ignored.
     * Resolves with the revision that is on disk after the call.
     */
    save(project: ProjectDocument): Promise<{ savedRevision: number }>;
    /** Transcodes an H.264 preview for files Chromium cannot decode. Cancellable via jobs.cancel(jobId). */
    createPreviewProxy(request: { jobId: string; inputPath: string }): Promise<{ fileUrl: string }>;
    /**
     * Renders one frame of the source at `atMs` with the exact export ASS
     * pipeline (pixel-accurate preview). Returns a PNG data URL.
     */
    renderPreviewFrame(request: {
      inputPath: string;
      atMs: number;
      videoWidth: number;
      videoHeight: number;
      text: string;
      style: SubtitleStyle;
    }): Promise<{ dataUrl: string }>;
  };
  workflow: {
    transcribe(request: TranscribeClipRequest): Promise<TranscribeClipResult>;
    translate(request: TranslateCaptionsRequest): Promise<TranslateCaptionsResult>;
  };
  jobs: {
    cancel(jobId: string): Promise<void>;
    /** Subscribes to progress events; returns an unsubscribe function. */
    onProgress(listener: (event: JobProgressEvent) => void): () => void;
  };
  export: {
    selectOutputFolder(): Promise<SelectOutputFolderResult>;
    exportProject(request: ProjectExportRequest): Promise<ProjectExportResult>;
    showInFolder(path: string): Promise<void>;
  };
  media: {
    getFfmpegStatus(): Promise<FfmpegStatus>;
  };
  updates: {
    getState(): Promise<UpdateState>;
    check(): Promise<UpdateState>;
    download(): Promise<UpdateState>;
    /** Quits and installs a downloaded update. */
    install(): Promise<void>;
    onState(listener: (state: UpdateState) => void): () => void;
  };
  app: {
    getInfo(): Promise<{ version: string; platform: string; isPackaged: boolean }>;
  };
};
