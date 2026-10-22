import type { TFunction } from 'i18next';
import type { JobBarResult } from '../components/workflow/JobBar';
import type { JobKind, JobRunResult } from '../state/useJobRunner';
import { appErrorKey } from '../utils/error-message';

/** Technical details longer than this are cut so one stack trace cannot fill the status bar. */
const MAX_DETAIL_LENGTH = 300;

export type JobView = JobBarResult & { detail?: string };

/**
 * Maps a settled job to the status bar message. Canceled work gets a neutral
 * message; errors keep the technical detail for an expandable line.
 */
export function jobOutcomeView<T>(
  kind: JobKind,
  outcome: JobRunResult<T>,
  t: TFunction,
  doneMessage: (value: T) => string
): JobView {
  switch (outcome.status) {
    case 'done':
      return { kind, status: 'done', message: doneMessage(outcome.value) };
    case 'canceled':
      return { kind, status: 'canceled', message: t('shell.result.canceled') };
    case 'stale':
      return { kind, status: 'error', message: t('shell.result.stale') };
    case 'error': {
      if (outcome.detail === 'busy') {
        return { kind, status: 'error', message: t('shell.result.busy') };
      }
      return {
        kind,
        status: 'error',
        message: t(appErrorKey(outcome.code)),
        detail: truncateDetail(outcome.detail)
      };
    }
  }
}

export function truncateDetail(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  return detail.length > MAX_DETAIL_LENGTH ? `${detail.slice(0, MAX_DETAIL_LENGTH)}…` : detail;
}
