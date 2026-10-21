import type { SubtitleTrack } from './subtitles';
import type { SubtitleStyle } from './style';

export type ExportOverwritePolicy = 'ask' | 'overwrite' | 'create_copy';

export type WriteSrtRequest = {
  outputPath: string;
  track: SubtitleTrack;
  /** Defaults to false so direct SRT export never replaces an existing file. */
  overwriteExisting?: boolean;
};

export type WriteSrtResult = {
  outputPath: string;
  segmentCount: number;
};

export type BurnSubtitlesRequest = {
  inputPath: string;
  outputPath: string;
  track: SubtitleTrack;
  style: SubtitleStyle;
  /** Defaults to false so ffmpeg refuses to replace an existing file. */
  overwriteExisting?: boolean;
};

export type BurnSubtitlesResult = {
  outputPath: string;
};

export type ExportProjectRequest = {
  inputPath: string;
  outputFolder: string;
  tracks: SubtitleTrack[];
  style: SubtitleStyle;
  trim?: {
    startMs: number;
    endMs: number;
    knownDurationMs?: number;
  };
  exportOriginalSrt: boolean;
  exportTranslatedSrt: boolean;
  burnedInTrack: 'original' | 'translation';
  fileNamePattern?: string;
  /** Defaults to ask, which stops before any existing output is replaced. */
  overwritePolicy?: ExportOverwritePolicy;
};

export type ExportProjectResult = {
  originalSrtPath?: string;
  translatedSrtPath?: string;
  burnedInVideoPath?: string;
};

export type SelectOutputFolderResult = {
  outputFolder: string;
} | null;

export type StructuredAppError = {
  code: string;
  message: string;
  details?: string;
};
