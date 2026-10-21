/* @vitest-environment node */
import { describe, expect, it, vi } from 'vitest';
import { QuitCoordinator, type QuitWindow } from '../../../src/main/quit-coordinator';
import { IPC_CHANNELS } from '../../../src/shared/types/ipc';

type Deferred = { promise: Promise<void>; resolve: () => void };

function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Records the order of shutdown steps so tests can assert the sequence. */
function harness(options: { windows?: QuitWindow[]; rendererTimeoutMs?: number; shutdownTimeoutMs?: number } = {}) {
  const log: string[] = [];
  const sent: Array<{ windowId: number; channel: string; payload: unknown }> = [];
  const windows: QuitWindow[] = options.windows ?? [
    { id: 1, send: (channel, payload) => sent.push({ windowId: 1, channel, payload }) }
  ];
  const drain = deferred();
  const flush = deferred();
  const cleanup = deferred();
  const quit = vi.fn(() => log.push('quit'));
  const coordinator = new QuitCoordinator({
    windows: () => windows,
    drainJobs: vi.fn(() => {
      log.push('drain:start');
      return drain.promise.then(() => {
        log.push('drain:done');
      });
    }),
    flushProjects: vi.fn(() => {
      log.push('flush:start');
      return flush.promise.then(() => {
        log.push('flush:done');
      });
    }),
    cleanupPreviews: vi.fn(() => {
      log.push('cleanup:start');
      return cleanup.promise.then(() => {
        log.push('cleanup:done');
      });
    }),
    quit,
    rendererReadyTimeoutMs: options.rendererTimeoutMs ?? 1000,
    shutdownTimeoutMs: options.shutdownTimeoutMs ?? 1000,
    createRequestId: () => 'request-1'
  });
  return { coordinator, log, sent, quit, drain, flush, cleanup };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function beforeQuit() {
  const event = { preventDefault: vi.fn() };
  return event;
}

describe('QuitCoordinator', () => {
  it('holds the first quit, asks each window to prepare, and runs the steps in order', async () => {
    const { coordinator, log, sent, quit, drain, flush, cleanup } = harness({
      windows: [
        { id: 1, send: (channel, payload) => sent.push({ windowId: 1, channel, payload }) },
        { id: 2, send: (channel, payload) => sent.push({ windowId: 2, channel, payload }) }
      ]
    });
    const event = beforeQuit();

    coordinator.handleBeforeQuit(event);
    await tick();

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(sent).toEqual([
      { windowId: 1, channel: IPC_CHANNELS.appPrepareQuit, payload: 'request-1' },
      { windowId: 2, channel: IPC_CHANNELS.appPrepareQuit, payload: 'request-1' }
    ]);
    expect(log).toEqual([]);

    coordinator.acknowledge('request-1', 1);
    await tick();
    expect(log).toEqual([]);
    coordinator.acknowledge('request-1', 2);
    await tick();
    expect(log).toEqual(['drain:start']);

    drain.resolve();
    await tick();
    expect(log).toEqual(['drain:start', 'drain:done', 'flush:start']);
    flush.resolve();
    await tick();
    cleanup.resolve();
    await vi.waitFor(() => expect(quit).toHaveBeenCalledTimes(1));

    expect(log).toEqual(['drain:start', 'drain:done', 'flush:start', 'flush:done', 'cleanup:start', 'cleanup:done', 'quit']);
  });

  it('ignores answers to an older request and answers from windows that were not asked', async () => {
    const { coordinator, log, drain } = harness();
    coordinator.handleBeforeQuit(beforeQuit());
    await tick();

    coordinator.acknowledge('some-old-request', 1);
    coordinator.acknowledge('request-1', 99);
    await tick();
    expect(log).not.toContain('drain:start');

    coordinator.acknowledge('request-1', 1);
    await tick();
    expect(log).toContain('drain:start');
    drain.resolve();
  });

  it('goes on after the renderer timeout when a window never answers', async () => {
    const { coordinator, log, quit, drain, flush, cleanup } = harness({ rendererTimeoutMs: 20 });
    coordinator.handleBeforeQuit(beforeQuit());

    await vi.waitFor(() => expect(log).toContain('drain:start'), { timeout: 500 });
    drain.resolve();
    await tick();
    flush.resolve();
    await tick();
    cleanup.resolve();
    await vi.waitFor(() => expect(quit).toHaveBeenCalledTimes(1), { timeout: 500 });
  });

  it('does not wait for renderers when there is no window', async () => {
    const { coordinator, log, drain, flush, cleanup, quit } = harness({ windows: [] });
    coordinator.handleBeforeQuit(beforeQuit());
    await tick();

    expect(log).toEqual(['drain:start']);
    drain.resolve();
    flush.resolve();
    cleanup.resolve();
    await vi.waitFor(() => expect(quit).toHaveBeenCalledTimes(1));
  });

  it('does not re-run the sequence when quit is requested again while it runs', async () => {
    const { coordinator, log, sent, drain, flush, cleanup, quit } = harness();
    coordinator.handleBeforeQuit(beforeQuit());
    const second = beforeQuit();
    coordinator.handleBeforeQuit(second);
    await tick();

    expect(second.preventDefault).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(1);

    coordinator.acknowledge('request-1', 1);
    await tick();
    drain.resolve();
    await tick();
    flush.resolve();
    await tick();
    cleanup.resolve();
    await vi.waitFor(() => expect(quit).toHaveBeenCalledTimes(1));
    expect(log.filter((entry) => entry === 'drain:start')).toHaveLength(1);
  });

  it('lets the second quit pass through after shutdown has finished', async () => {
    const { coordinator, drain, flush, cleanup, quit } = harness({ windows: [] });
    coordinator.handleBeforeQuit(beforeQuit());
    drain.resolve();
    flush.resolve();
    cleanup.resolve();
    await vi.waitFor(() => expect(quit).toHaveBeenCalledTimes(1));

    const event = beforeQuit();
    coordinator.handleBeforeQuit(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('still saves projects when a job never stops, after the drain budget', async () => {
    const flushProjects = vi.fn(async () => undefined);
    const quit = vi.fn();
    const coordinator = new QuitCoordinator({
      windows: () => [],
      drainJobs: () => new Promise<void>(() => undefined),
      flushProjects,
      cleanupPreviews: async () => undefined,
      quit,
      rendererReadyTimeoutMs: 10,
      drainTimeoutMs: 20,
      shutdownTimeoutMs: 5000
    });
    coordinator.handleBeforeQuit(beforeQuit());

    await vi.waitFor(() => expect(quit).toHaveBeenCalledTimes(1), { timeout: 1000 });
    expect(flushProjects).toHaveBeenCalledTimes(1);
  });

  it('still drains and saves when the window list cannot be read', async () => {
    const flushProjects = vi.fn(async () => undefined);
    const quit = vi.fn();
    const coordinator = new QuitCoordinator({
      windows: () => {
        throw new Error('no windows');
      },
      drainJobs: async () => undefined,
      flushProjects,
      cleanupPreviews: async () => undefined,
      quit
    });
    coordinator.handleBeforeQuit(beforeQuit());

    await vi.waitFor(() => expect(quit).toHaveBeenCalledTimes(1));
    expect(flushProjects).toHaveBeenCalledTimes(1);
  });

  it('quits when a shutdown step never settles, once the overall timeout passes', async () => {
    const { coordinator, quit } = harness({ windows: [], shutdownTimeoutMs: 30 });
    coordinator.handleBeforeQuit(beforeQuit());

    await vi.waitFor(() => expect(quit).toHaveBeenCalledTimes(1), { timeout: 500 });
  });

  it('keeps going when a step rejects, so the app still quits', async () => {
    const quit = vi.fn();
    const coordinator = new QuitCoordinator({
      windows: () => [],
      drainJobs: async () => {
        throw new Error('child exited badly');
      },
      flushProjects: async () => undefined,
      cleanupPreviews: async () => undefined,
      quit,
      rendererReadyTimeoutMs: 10,
      shutdownTimeoutMs: 1000
    });
    coordinator.handleBeforeQuit(beforeQuit());

    await vi.waitFor(() => expect(quit).toHaveBeenCalledTimes(1));
  });

  it('treats a window that cannot be reached as having answered', async () => {
    const quit = vi.fn();
    const drainJobs = vi.fn(async () => undefined);
    const coordinator = new QuitCoordinator({
      windows: () => [
        {
          id: 5,
          send: () => {
            throw new Error('Object has been destroyed');
          }
        }
      ],
      drainJobs,
      flushProjects: async () => undefined,
      cleanupPreviews: async () => undefined,
      quit,
      rendererReadyTimeoutMs: 10000,
      shutdownTimeoutMs: 10000,
      createRequestId: () => 'request-2'
    });
    coordinator.handleBeforeQuit(beforeQuit());

    await vi.waitFor(() => expect(quit).toHaveBeenCalledTimes(1), { timeout: 500 });
    expect(drainJobs).toHaveBeenCalledTimes(1);
  });
});
