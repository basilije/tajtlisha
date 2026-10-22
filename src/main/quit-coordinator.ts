import { randomUUID } from 'node:crypto';
import { IPC_CHANNELS, type QuitReadyResult } from '../shared/types/ipc';

/** How long a renderer may take to flush its autosave before quit goes on without it. */
export const RENDERER_READY_TIMEOUT_MS = 3000;
/** How long job draining may take. A job that ignores its abort signal must not block the project save. */
export const DRAIN_TIMEOUT_MS = 5000;
/** Upper bound for the whole shutdown. Past this the app quits even if some step is stuck. */
export const SHUTDOWN_TIMEOUT_MS = 10000;

export type QuitWindow = {
  id: number;
  send(channel: string, payload: unknown): void;
};

/** The user's answer when a renderer could not save its pending work. */
export type UnsavedQuitAnswer = 'retry' | 'quit' | 'cancel';

export type QuitCoordinatorOptions = {
  /** Currently open windows. Destroyed windows must not be returned. */
  windows(): QuitWindow[];
  /** Aborts running jobs and resolves once they have stopped. */
  drainJobs(): Promise<void>;
  flushProjects(): Promise<void>;
  /** Removes preview files. Runs after drainJobs so no transcode writes into a removed file. */
  cleanupPreviews(): Promise<void>;
  /**
   * Asks the user what to do when a window reports unsaved work. 'retry' asks
   * the windows again, 'quit' goes on without saving, 'cancel' aborts the quit.
   * A throw counts as 'cancel', so no data is lost by a broken dialog.
   */
  confirmUnsavedQuit(detail: string | undefined): Promise<UnsavedQuitAnswer>;
  /** Called once shutdown work is done. The second before-quit pass lets the quit through. */
  quit(): void;
  rendererReadyTimeoutMs?: number;
  drainTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  createRequestId?: () => string;
};

/** Enough of Electron's before-quit event for the coordinator. */
export type BeforeQuitEvent = { preventDefault(): void };

type Phase = 'idle' | 'shutting_down' | 'done';

/**
 * Runs the shutdown sequence on the first before-quit: ask every renderer to
 * flush pending edits, wait for their answers (or a timeout), ask the user when
 * a renderer could not save, drain jobs, save projects, remove temp files, then
 * quit. Repeated quit requests during the sequence are held. A cancelled quit
 * returns to idle, so the next quit starts the sequence again. Once the
 * sequence is done the next quit passes through.
 */
export class QuitCoordinator {
  private phase: Phase = 'idle';
  private activeRequestId: string | undefined;
  private waitingWindowIds = new Set<number>();
  private notifyAllReady: (() => void) | undefined;
  /** First unsaved report in the current round. Reset for every round. */
  private roundUnsaved: QuitReadyResult | undefined;

  private readonly rendererReadyTimeoutMs: number;
  private readonly drainTimeoutMs: number;
  private readonly shutdownTimeoutMs: number;
  private readonly createRequestId: () => string;

  constructor(private readonly options: QuitCoordinatorOptions) {
    this.rendererReadyTimeoutMs = options.rendererReadyTimeoutMs ?? RENDERER_READY_TIMEOUT_MS;
    this.drainTimeoutMs = options.drainTimeoutMs ?? DRAIN_TIMEOUT_MS;
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? SHUTDOWN_TIMEOUT_MS;
    this.createRequestId = options.createRequestId ?? randomUUID;
  }

  handleBeforeQuit(event: BeforeQuitEvent): void {
    if (this.phase === 'done') return;

    event.preventDefault();
    if (this.phase === 'shutting_down') return;

    this.phase = 'shutting_down';
    void this.shutDown()
      .catch((): ShutdownOutcome => 'quit')
      .then((outcome) => {
        this.activeRequestId = undefined;
        this.notifyAllReady = undefined;
        if (outcome === 'cancel') {
          this.phase = 'idle';
          return;
        }
        this.phase = 'done';
        this.options.quit();
      });
  }

  /** True while the shutdown sequence runs (including the unsaved-work question). */
  get shuttingDown(): boolean {
    return this.phase === 'shutting_down';
  }

  /** Renderer answered the prepare request. Answers for other requests are ignored. */
  acknowledge(requestId: string, windowId: number, result: QuitReadyResult): void {
    if (requestId !== this.activeRequestId) return;
    if (!this.waitingWindowIds.delete(windowId)) return;
    if (!result.saved && this.roundUnsaved === undefined) {
      this.roundUnsaved = result;
    }
    if (this.waitingWindowIds.size === 0) {
      this.notifyAllReady?.();
    }
  }

  private async shutDown(): Promise<ShutdownOutcome> {
    if ((await this.askRenderers()) === 'cancel') return 'cancel';
    // The shutdown timeout starts after the user answered, so a dialog cannot run it out.
    await settle(withTimeout(this.runSteps(), this.shutdownTimeoutMs));
    return 'quit';
  }

  /**
   * Asks the windows to flush until none reports unsaved work, or the user
   * decides to quit anyway or cancel. Windows that never answer count as saved.
   */
  private async askRenderers(): Promise<'continue' | 'cancel'> {
    for (;;) {
      const unsaved = await this.waitForRenderers();
      if (!unsaved) return 'continue';

      const answer = await this.confirmUnsaved(unsaved.detail);
      if (answer === 'retry') continue;
      return answer === 'quit' ? 'continue' : 'cancel';
    }
  }

  private async confirmUnsaved(detail: string | undefined): Promise<UnsavedQuitAnswer> {
    try {
      return await this.options.confirmUnsavedQuit(detail);
    } catch {
      return 'cancel';
    }
  }

  /**
   * Each step runs even if an earlier one failed or stalled. Draining is capped
   * so a stuck job cannot keep the project save from happening.
   */
  private async runSteps(): Promise<void> {
    await withTimeout(settle(this.options.drainJobs()), this.drainTimeoutMs);
    await settle(this.options.flushProjects());
    await settle(this.options.cleanupPreviews());
  }

  /** One prepare round. Resolves with the first unsaved report, or undefined when every answer was saved. */
  private async waitForRenderers(): Promise<QuitReadyResult | undefined> {
    const requestId = this.createRequestId();
    this.activeRequestId = requestId;
    this.roundUnsaved = undefined;
    let windows: QuitWindow[];
    try {
      windows = this.options.windows();
    } catch {
      windows = [];
    }
    this.waitingWindowIds = new Set(windows.map((window) => window.id));

    const allReady = new Promise<void>((resolve) => {
      this.notifyAllReady = resolve;
    });
    if (this.waitingWindowIds.size === 0) {
      this.notifyAllReady?.();
    }

    for (const window of windows) {
      try {
        window.send(IPC_CHANNELS.appPrepareQuit, requestId);
      } catch {
        // The window was destroyed after it was listed; nothing to wait for.
        this.acknowledge(requestId, window.id, { saved: true });
      }
    }

    await withTimeout(allReady, this.rendererReadyTimeoutMs);
    // Late answers after the timeout must not count for a later request.
    const unsaved = this.roundUnsaved;
    this.activeRequestId = undefined;
    this.notifyAllReady = undefined;
    this.roundUnsaved = undefined;
    return unsaved;
  }
}

type ShutdownOutcome = 'quit' | 'cancel';

function settle(work: Promise<void>): Promise<void> {
  return work.then(
    () => undefined,
    () => undefined
  );
}

/** Resolves with `work`, or with undefined when `ms` passes first. */
export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
