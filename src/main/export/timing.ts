import type { SubtitleTrack, TranscriptSegment } from '../../shared/types/subtitles';

export type TimingValidationIssue = {
  segmentId: string;
  code: 'negative_start' | 'non_positive_duration' | 'overlap';
  message: string;
};

export function validateSubtitleTiming(track: SubtitleTrack): TimingValidationIssue[] {
  const issues: TimingValidationIssue[] = [];
  let previous: TranscriptSegment | undefined;

  for (const segment of track.segments) {
    if (segment.startMs < 0) {
      issues.push({
        segmentId: segment.id,
        code: 'negative_start',
        message: 'Segment start time cannot be negative.'
      });
    }

    if (segment.endMs <= segment.startMs) {
      issues.push({
        segmentId: segment.id,
        code: 'non_positive_duration',
        message: 'Segment end time must be greater than start time.'
      });
    }

    if (previous && segment.startMs < previous.endMs) {
      issues.push({
        segmentId: segment.id,
        code: 'overlap',
        message: `Segment overlaps previous segment "${previous.id}".`
      });
    }

    previous = segment;
  }

  return issues;
}

export function assertValidSubtitleTiming(track: SubtitleTrack): void {
  const issues = validateSubtitleTiming(track);
  if (issues.length > 0) {
    throw new Error(`Invalid subtitle timing: ${issues.map((issue) => `${issue.segmentId}:${issue.code}`).join(', ')}`);
  }
}
