import type { AiProviderId } from './ai';
import type { CaptionRow, TrimRange } from './project';
import type { SubtitleStyle } from './style';

/**
 * Long-running operations (AI, ffmpeg) are identified by a renderer-generated
 * jobId. The renderer can cancel a job with jobs.cancel(jobId) and receives
 * progress through jobs.onProgress. A canceled job rejects with an error whose
 * message starts with '[JOB_CANCELED]'.
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
  captions: Array<{ id: string; text: string }>;
  polish: PolishMode;
  maxCharsPerLine: number;
  maxLinesPerCaption: 1 | 2;
};

export type TranslateCaptionsResult = {
  /** Exactly one entry per requested caption id, same order. Never silently falls back to source text. */
  translations: Array<{ id: string; text: string }>;
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
  overwritePolicy: 'ask' | 'overwrite' | 'create_copy';
};

export type ExportedFileKind = 'original_srt' | 'translation_srt' | 'video';

export type ProjectExportResult = {
  files: Array<{ kind: ExportedFileKind; path: string }>;
};
