/** Issue codes computed by the caption validation (main/renderer model). Unknown codes are shown as "other". */
export const KNOWN_ISSUE_CODES = [
  'end_before_start',
  'overlaps_previous',
  'outside_trim',
  'empty_original',
  'empty_translation',
  'too_short',
  'line_too_long',
  'stale_translation'
] as const;

/** Codes that stop export. The rest are warnings the user can ignore. */
export const BLOCKING_ISSUE_CODES: readonly string[] = [
  'end_before_start',
  'overlaps_previous',
  'empty_translation'
];

export function isBlockingIssue(code: string): boolean {
  return BLOCKING_ISSUE_CODES.includes(code);
}

export function issueLabelKey(code: string): string {
  return (KNOWN_ISSUE_CODES as readonly string[]).includes(code)
    ? `captions.issues.${code}`
    : 'captions.issues.unknown';
}
