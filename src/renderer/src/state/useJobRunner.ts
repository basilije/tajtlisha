import { useCallback, useEffect, useRef, useState } from 'react';
import { parseAppErrorMessage, type AppErrorCode } from '../../../shared/errors';
import type { TajtlishaApi } from '../../../shared/types/ipc';
import type { JobProgressEvent, JobStage } from '../../../shared/types/jobs';

export type JobKind = 'transcribe' | 'translate' | 'export' | 'preview';

export type ActiveJob = {
  id: string;
  kind: JobKind;
  stage?: JobStage;
  /** 0..1 when the backend reports it. */
  progress?: number;
  startedAt: number;
};

export type JobRunOptions = {
  /** Checked after the work settles. Returning false turns the outcome into 'stale'. */
  isStillValid?: () => boolean;
};

export type JobRunResult<T> =
  | { status: 'done'; value: T }
  | { status: 'stale' }
  | { status: 'canceled' }
  | { status: 'error'; code: AppErrorCode; detail?: string };

export type JobRunner = {
  job: ActiveJob | null;
  run: <T>(kind: JobKind, work: (jobId: string) => Promise<T>, options?: JobRunOptions) => Promise<JobRunResult<T>>;
  /** Rejects if the IPC cancel call fails. No-op when no job is active. */
  cancel: () => Promise<void>;
};

export function useJobRunner(api: TajtlishaApi | undefined = getWindowApi()): JobRunner {
  const [job, setJob] = useState<ActiveJob | null>(null);
  // Refs, not state: the busy guard must hold between two synchronous run() calls.
  const busyRef = useRef(false);
  const activeJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!api) return;
    return api.jobs.onProgress((event: JobProgressEvent) => {
      setJob((current) =>
        current && current.id === event.jobId ? { ...current, stage: event.stage, progress: event.progress } : current
      );
    });
  }, [api]);

  const run = useCallback(
    async <T>(kind: JobKind, work: (jobId: string) => Promise<T>, options: JobRunOptions = {}): Promise<JobRunResult<T>> => {
      if (busyRef.current) return { status: 'error', code: 'UNKNOWN', detail: 'busy' };

      busyRef.current = true;
      const jobId = crypto.randomUUID();
      activeJobIdRef.current = jobId;
      setJob({ id: jobId, kind, startedAt: Date.now() });

      try {
        const value = await work(jobId);
        if (isStale(options)) return { status: 'stale' };
        return { status: 'done', value };
      } catch (error) {
        const parsed = parseAppErrorMessage(error instanceof Error ? error.message : String(error));
        if (parsed.code === 'JOB_CANCELED') return { status: 'canceled' };
        if (isStale(options)) return { status: 'stale' };
        return { status: 'error', code: parsed.code, detail: parsed.detail };
      } finally {
        busyRef.current = false;
        activeJobIdRef.current = null;
        setJob(null);
      }
    },
    []
  );

  const cancel = useCallback(async () => {
    const jobId = activeJobIdRef.current;
    if (!jobId || !api) return;
    await api.jobs.cancel(jobId);
  }, [api]);

  return { job, run, cancel };
}

function isStale(options: JobRunOptions): boolean {
  return options.isStillValid !== undefined && !options.isStillValid();
}

function getWindowApi(): TajtlishaApi | undefined {
  return typeof window === 'undefined' ? undefined : window.tajtlisha;
}
