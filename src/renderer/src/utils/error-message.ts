import { parseAppErrorMessage, type AppErrorCode } from '../../../shared/errors';

/** Message for errors thrown by plain code paths (not AppError). Strips IPC wrappers. */
export function userFacingErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) {
    return fallback;
  }

  const message = error.message
    .replace(/^Error invoking remote method '[^']+':\s*Error:\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();

  return message || fallback;
}

/** i18n key for an AppError code. Every code has a `captions.errors.*` entry. */
export function appErrorKey(code: AppErrorCode): string {
  return `captions.errors.${code}`;
}

/** Splits an error thrown across IPC into its AppError code and technical detail. */
export function describeAppError(error: unknown): { code: AppErrorCode; detail?: string } {
  const message = error instanceof Error ? error.message : String(error);
  return parseAppErrorMessage(message);
}
