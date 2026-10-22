import { AppError } from '../../shared/errors';

/**
 * Escapes a value for an ffmpeg filter option. Each special character gets three
 * backslashes: the filtergraph parser consumes one level and the filter's option
 * parser reads the next. Quoting alone broke on paths with quotes or colons.
 */
export function escapeFilterValue(value: string): string {
  return value.replace(/[\\':,[\];]/g, (char) => `\\\\\\${char}`);
}

export function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

export function throwIfCanceled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new AppError('JOB_CANCELED');
  }
}
