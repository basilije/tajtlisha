import { AppError } from '../../shared/errors';
import { IPC_CHANNELS } from '../../shared/types/ipc';
import type { JobProgressEvent, JobStage } from '../../shared/types/jobs';

/** Same-stage progress messages are sent at most this often. Stage changes are never throttled. */
export const PROGRESS_THROTTLE_MS = 100;

/**
 * The window that started a job. Job ids are scoped to the owner, and progress
 * goes back to it. Structural so tests can pass fakes instead of WebContents.
 */
export type JobOwner = {
  id: number;
  send(channel: string, payload: unknown): void;
};

export type JobProgressReport = {
  stage: JobStage;
  progress?: number;
};

export type JobContext = {
  signal: AbortSignal;
  onProgress(event: JobProgressReport): void;
};

export type ActiveJob = {
  signal: AbortSignal;
  report(stage: JobStage, progress?: number): void;
  /** Idempotent. Releases the job id and lets pending cancel() calls resolve. */
  finish(): void;
};

type JobEntry = {
  owner: JobOwner;
  controller: AbortController;
  lastStage?: JobStage;
  lastSentAt: number;
  /** Resolves when the job's finish() runs, i.e. after the work has actually stopped. */
  finished: Promise<void>;
  markFinished: () => void;
};

/**
 * Tracks long-running main-process work (AI, ffmpeg) per window. Renderer job
 * ids are only unique inside one window, so entries are keyed by owner first.
 */
export class JobRegistry {
  private readonly jobsByOwner = new Map<number, Map<string, JobEntry>>();

  constructor(private readonly now: () => number = Date.now) {}

  start(jobId: string, owner: JobOwner): ActiveJob {
    const jobs = this.jobsByOwner.get(owner.id) ?? new Map<string, JobEntry>();
    if (jobs.has(jobId)) {
      throw new AppError('UNKNOWN', 'duplicate job id');
    }
    this.jobsByOwner.set(owner.id, jobs);

    let markFinished: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => {
      markFinished = resolve;
    });
    const entry: JobEntry = {
      owner,
      controller: new AbortController(),
      lastSentAt: Number.NEGATIVE_INFINITY,
      finished,
      markFinished
    };
    jobs.set(jobId, entry);

    let done = false;
    return {
      signal: entry.controller.signal,
      report: (stage, progress) => {
        if (!done) this.send(jobId, entry, stage, progress);
      },
      finish: () => {
        if (done) return;
        done = true;
        if (jobs.get(jobId) === entry) jobs.delete(jobId);
        if (jobs.size === 0 && this.jobsByOwner.get(owner.id) === jobs) this.jobsByOwner.delete(owner.id);
        entry.markFinished();
      }
    };
  }

  /**
   * Aborts one of the owner's jobs. Resolves once that job has finished, which
   * for ffmpeg and AI calls means after the child process has exited. Unknown
   * ids (including other windows' jobs) are a no-op.
   */
  async cancel(jobId: string, ownerId: number): Promise<void> {
    const entry = this.jobsByOwner.get(ownerId)?.get(jobId);
    if (!entry) return;
    entry.controller.abort();
    await entry.finished;
  }

  /** Aborts every job of a window that is going away. Does not wait for them. */
  cancelAllFor(ownerId: number): void {
    const jobs = this.jobsByOwner.get(ownerId);
    if (!jobs) return;
    for (const entry of jobs.values()) {
      entry.controller.abort();
    }
  }

  private send(jobId: string, entry: JobEntry, stage: JobStage, progress: number | undefined): void {
    const now = this.now();
    const sameStage = stage === entry.lastStage;
    if (sameStage && now - entry.lastSentAt < PROGRESS_THROTTLE_MS) return;

    entry.lastStage = stage;
    entry.lastSentAt = now;
    const payload: JobProgressEvent = { jobId, stage, progress };
    try {
      entry.owner.send(IPC_CHANNELS.jobsProgress, payload);
    } catch {
      // The window was destroyed between the job's progress tick and this send.
    }
  }
}

/**
 * Registers a job for `owner`, runs `fn` with its signal and progress hook, and
 * always finishes the job. A job aborted by cancel() rejects with JOB_CANCELED
 * even when the service reported a different error while stopping.
 */
export async function runJob<T>(
  registry: JobRegistry,
  owner: JobOwner,
  jobId: string,
  fn: (context: JobContext) => Promise<T>
): Promise<T> {
  const job = registry.start(jobId, owner);
  try {
    return await fn({
      signal: job.signal,
      onProgress: ({ stage, progress }) => job.report(stage, progress)
    });
  } catch (error) {
    if (job.signal.aborted && !(error instanceof AppError && error.code === 'JOB_CANCELED')) {
      throw new AppError('JOB_CANCELED');
    }
    throw error;
  } finally {
    job.finish();
  }
}
