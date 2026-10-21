export type SubtitleTrackKind = 'original' | 'translation';

export type TranscriptSegment = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  language: string;
  confidence?: number;
};

export type SubtitleTrack = {
  id: string;
  kind: SubtitleTrackKind;
  language: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  segments: TranscriptSegment[];
};
