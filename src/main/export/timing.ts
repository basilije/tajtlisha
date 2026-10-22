import { AppError } from '../../shared/errors';

/** Anything with an id and a start/end on the same timeline. */
export type TimedCue = {
  id: string;
  startMs: number;
  endMs: number;
};

export type TimingValidationIssue = {
  cueId: string;
  code: 'negative_start' | 'non_positive_duration' | 'overlap';
  message: string;
};

/** Cues must be sorted by start; each cue is checked against the previous one. */
export function validateSubtitleTiming(cues: readonly TimedCue[]): TimingValidationIssue[] {
  const issues: TimingValidationIssue[] = [];
  let previous: TimedCue | undefined;

  for (const cue of cues) {
    if (cue.startMs < 0) {
      issues.push({ cueId: cue.id, code: 'negative_start', message: 'Caption start time cannot be negative.' });
    }

    if (cue.endMs <= cue.startMs) {
      issues.push({ cueId: cue.id, code: 'non_positive_duration', message: 'Caption end time must be greater than start time.' });
    }

    if (previous && cue.startMs < previous.endMs) {
      issues.push({ cueId: cue.id, code: 'overlap', message: `Caption overlaps previous caption "${previous.id}".` });
    }

    previous = cue;
  }

  return issues;
}

export function assertValidSubtitleTiming(cues: readonly TimedCue[]): void {
  const issues = validateSubtitleTiming(cues);
  if (issues.length > 0) {
    throw new AppError('INVALID_TIMING', issues.map((issue) => `${issue.cueId} (${issue.code})`).join(', '));
  }
}
