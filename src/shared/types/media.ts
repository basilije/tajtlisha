export type FfmpegStatus = {
  available: boolean;
  path?: string;
  version?: string;
  message?: string;
};

export type MediaProbeRequest = {
  inputPath: string;
};

export type MediaProbeResult = {
  inputPath: string;
  durationMs?: number;
  hasAudio?: boolean;
  hasVideo?: boolean;
  /** Display size of the first video stream, rotation applied. */
  width?: number;
  height?: number;
};

export type SelectVideoResult = {
  inputPath: string;
  fileUrl: string;
  durationMs?: number;
  hasAudio?: boolean;
  hasVideo?: boolean;
} | null;

export type CreatePreviewProxyRequest = {
  inputPath: string;
};

export type CreatePreviewProxyResult = {
  fileUrl: string;
};

export type TrimRequest = {
  inputPath: string;
  outputPath: string;
  startMs: number;
  endMs: number;
  knownDurationMs?: number;
};

export type TrimResult = {
  outputPath: string;
  durationMs: number;
};

export type AudioExtractRequest = {
  inputPath: string;
  outputPath: string;
  format: 'wav' | 'mp3' | 'm4a';
  startMs?: number;
  endMs?: number;
};

export type AudioExtractResult = {
  outputPath: string;
  format: 'wav' | 'mp3' | 'm4a';
  durationMs?: number;
};
