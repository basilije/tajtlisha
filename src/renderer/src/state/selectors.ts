import type { CaptionRow, ProjectDocument, TrimRange } from '../../../shared/types/project';
import { MIN_CAPTION_MS } from './project-reducer';

export type CaptionIssueCode =
  | 'end_before_start'
  | 'overlaps_previous'
  | 'outside_trim'
  | 'empty_original'
  | 'empty_translation'
  | 'too_short'
  | 'line_too_long';

export type CaptionIssue = {
  code: CaptionIssueCode;
  /** Only for overlaps_previous: how many ms the caption overlaps the row before it. */
  overlapMs?: number;
};

/** Issues for every caption id (empty array when the caption is clean). */
export type CaptionIssueMap = Record<string, CaptionIssue[]>;

export type CaptionValidationOptions = {
  requireTranslation: boolean;
  maxCharsPerLine: number;
};

export type WorkflowStep = 'import' | 'trim' | 'translate' | 'review';

/** Issues that block export/review. Everything else is a warning. */
const BLOCKING_CODES: ReadonlySet<CaptionIssueCode> = new Set<CaptionIssueCode>([
  'end_before_start',
  'overlaps_previous',
  'empty_translation'
]);

/** Line-length slack above maxCharsPerLine before line_too_long is raised. */
const LINE_LENGTH_SLACK = 10;

/**
 * Binary search over captions sorted by startMs. Start is inclusive, end is
 * exclusive. Assumes captions do not overlap.
 */
export function findActiveCaption(captions: readonly CaptionRow[], timeMs: number): CaptionRow | undefined {
  let low = 0;
  let high = captions.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (captions[middle].startMs <= timeMs) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (found < 0) return undefined;
  const caption = captions[found];
  return timeMs < caption.endMs ? caption : undefined;
}

export function validateCaptions(
  captions: readonly CaptionRow[],
  trim: TrimRange,
  options: CaptionValidationOptions
): CaptionIssueMap {
  const result: CaptionIssueMap = {};
  for (const caption of captions) result[caption.id] = [];

  // Overlap is checked against the latest end seen so far, so a long caption
  // that covers several later rows flags each of them.
  const sorted = [...captions].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const lineLimit = options.maxCharsPerLine + LINE_LENGTH_SLACK;
  let latestEnd = Number.NEGATIVE_INFINITY;

  for (const caption of sorted) {
    const issues = result[caption.id];
    const inverted = caption.endMs < caption.startMs;

    if (inverted) {
      issues.push({ code: 'end_before_start' });
    } else if (caption.endMs - caption.startMs < MIN_CAPTION_MS) {
      issues.push({ code: 'too_short' });
    }

    if (latestEnd > caption.startMs) {
      issues.push({ code: 'overlaps_previous', overlapMs: latestEnd - caption.startMs });
    }
    latestEnd = Math.max(latestEnd, caption.endMs);

    if (caption.startMs < trim.startMs || caption.endMs > trim.endMs) {
      issues.push({ code: 'outside_trim' });
    }
    if (caption.original.trim() === '') {
      issues.push({ code: 'empty_original' });
    }
    if (options.requireTranslation && caption.translation.trim() === '') {
      issues.push({ code: 'empty_translation' });
    }
    if (longestLine(caption.original) > lineLimit || longestLine(caption.translation) > lineLimit) {
      issues.push({ code: 'line_too_long' });
    }
  }

  return result;
}

/** Counts blocking issues (see BLOCKING_CODES). Accepts the full map or a single caption's list. */
export function blockingIssueCount(issues: CaptionIssueMap | readonly CaptionIssue[]): number {
  const lists = isIssueList(issues) ? [issues] : Object.values(issues);
  let count = 0;
  for (const list of lists) {
    for (const issue of list) {
      if (BLOCKING_CODES.has(issue.code)) count += 1;
    }
  }
  return count;
}

export function isBlockingCaptionIssue(code: CaptionIssueCode): boolean {
  return BLOCKING_CODES.has(code);
}

/** Captions that overlap the trim range at all. Partially covered captions are included. */
export function captionsInTrim(captions: readonly CaptionRow[], trim: TrimRange): CaptionRow[] {
  return captions.filter((caption) => caption.endMs > trim.startMs && caption.startMs < trim.endMs);
}

export function workflowStep(project: ProjectDocument): WorkflowStep {
  if (!project.source) return 'import';
  if (project.captions.length === 0) return 'trim';
  const someUntranslated = project.captions.some((caption) => caption.translation.trim() === '');
  return someUntranslated ? 'translate' : 'review';
}

function isIssueList(value: CaptionIssueMap | readonly CaptionIssue[]): value is readonly CaptionIssue[] {
  return Array.isArray(value);
}

function longestLine(text: string): number {
  let longest = 0;
  for (const line of text.split('\n')) {
    longest = Math.max(longest, line.trim().length);
  }
  return longest;
}
