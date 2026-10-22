export type FfmpegCapabilityFlags = {
  ffprobe: boolean;
  assFilter: boolean;
  libx264: boolean;
  aac: boolean;
  mp3: boolean;
};

export type FfmpegStatus = {
  /** ffmpeg runs and nothing the app needs is missing. */
  available: boolean;
  path?: string;
  version?: string;
  message?: string;
  /** Human-readable names of what the app needs and does not have. */
  missing?: string[];
  capabilities?: FfmpegCapabilityFlags;
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
