import type { AiProviderId } from './ai';
import type { CaptionRow, TrimRange } from './project';
import type { SubtitleStyle } from './style';

/**
 * Long-running operations (AI, ffmpeg) are identified by a renderer-generated
 * jobId. The renderer can cancel a job with jobs.cancel(jobId) and receives
 * progress through jobs.onProgress. A canceled job rejects with an error whose
 * message contains '[JOB_CANCELED]'. Job ids are scoped to the invoking window;
 * main rejects duplicate active ids and cancels a window's jobs when it closes.
 * Cancellation resolves only after the child process has exited.
 *
 * Stale results: the renderer captures project id + revision when starting a
 * job and applies the result only if they still match (see useJobRunner).
 */
export type JobStage =
  | 'extracting_audio'
  | 'detecting_speech'
  | 'transcribing'
  | 'translating'
  | 'polishing'
  | 'rendering_video'
  | 'writing_srt';

export type JobProgressEvent = {
  jobId: string;
  stage: JobStage;
  /** 0..1 when known; undefined for indeterminate stages. */
  progress?: number;
};

/** How the caption timing was obtained. */
export type CaptionTimingSource = 'word' | 'segment' | 'speech_detection';

export type TranscribeClipRequest = {
  jobId: string;
  inputPath: string;
  trim: TrimRange;
  providerId: AiProviderId;
  modelId?: string;
  /** Spoken language code; undefined = auto-detect. */
  language?: string;
  maxCharsPerLine: number;
  maxLinesPerCaption: 1 | 2;
};

export type TranscribeClipResult = {
  /** Detected or requested language code ('und' when unknown). */
  language: string;
  /** Source-absolute timings; translation is always ''. */
  captions: CaptionRow[];
  timingSource: CaptionTimingSource;
};

export type PolishMode = 'none' | 'conservative' | 'social_caption';

export type TranslateCaptionsRequest = {
  jobId: string;
  providerId: AiProviderId;
  modelId?: string;
  sourceLanguage: string;
  targetLanguage: string;
  /**
   * Open video, required by providers that translate the media itself (Opus).
   * Must be a path this session already opened.
   */
  inputPath?: string;
  captions: Array<{ id: string; text: string; startMs?: number; endMs?: number }>;
  polish: PolishMode;
  maxCharsPerLine: number;
  maxLinesPerCaption: 1 | 2;
};

export type TranslationCredits = {
  beforeMinutes: number | null;
  afterMinutes: number | null;
};

export type TranslateCaptionsResult = {
  /** Exactly one entry per requested caption id, same order. Never silently falls back to source text. */
  translations: Array<{ id: string; text: string }>;
  /** Present when the provider bills a credit balance, read before the job and again after it. */
  credits?: TranslationCredits;
};

export type ExportOutputs = {
  originalSrt: boolean;
  translationSrt: boolean;
  /** Which text to burn into the MP4; 'none' skips video rendering entirely. */
  video: 'none' | 'original' | 'translation';
};

export type ProjectExportRequest = {
  jobId: string;
  inputPath: string;
  outputFolder: string;
  /** File name stem without extension, e.g. 'my-clip'. Must not contain path separators. */
  baseName: string;
  /** Display size of the source video, used for ASS PlayRes and style geometry. */
  videoWidth: number;
  videoHeight: number;
  trim: TrimRange;
  captions: CaptionRow[];
  sourceLanguage: string;
  targetLanguage: string;
  style: SubtitleStyle;
  outputs: ExportOutputs;
  /**
   * 'ask': when outputs exist, MAIN shows a native dialog (Replace / Create
   * copies / Cancel) and continues; the renderer never parses conflict paths.
   * Cancel rejects with EXPORT_CANCELED.
   */
  overwritePolicy: 'ask' | 'overwrite' | 'create_copy';
};

export type ExportedFileKind = 'original_srt' | 'translation_srt' | 'video';

export type ProjectExportResult = {
  files: Array<{ kind: ExportedFileKind; path: string }>;
};
