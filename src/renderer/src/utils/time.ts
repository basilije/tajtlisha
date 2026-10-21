/**
 * Timecode helpers shared by the trim bar, caption table and preview.
 * Display format: m:ss.d (tenths), or m:ss.mmm with { precision: 'ms' }.
 */
export function formatTimecode(ms: number, options: { precision?: 'tenths' | 'ms' } = {}): string {
  const safe = Math.max(0, Math.round(Number.isFinite(ms) ? ms : 0));
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor((safe % 60000) / 1000);
  const fraction =
    options.precision === 'ms'
      ? (safe % 1000).toString().padStart(3, '0')
      : Math.floor((safe % 1000) / 100).toString();
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${fraction}`;
}

/** Duration in seconds with one decimal, e.g. 2.5 -> "2.5 s" is left to i18n; this returns "2.5". */
export function formatSeconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(1);
}

/**
 * Parses "1:02.5", "01:02.500", "62.5", "62,5" or "1:2" into milliseconds.
 * Returns null for anything else. Hours are not supported (clips are short).
 */
export function parseTimecode(input: string): number | null {
  const value = input.trim().replace(',', '.');
  if (!value) return null;

  const match = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(value);
  if (!match) return null;

  const minutes = match[1] ? Number(match[1]) : 0;
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  if (match[1] && seconds >= 60) return null;

  return Math.round((minutes * 60 + seconds) * 1000);
}
