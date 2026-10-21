import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useJobRunner, type JobRunResult } from '../../../src/renderer/src/state/useJobRunner';
import { createFakeApi } from './fakeApi';

type Gate<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void };

function gate<T>(): Gate<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useJobRunner', () => {
  it('returns done with the work value and clears the job afterwards', async () => {
    const fake = createFakeApi();
    const { result } = renderHook(() => useJobRunner(fake.api));

    const outcome = await result.current.run('translate', async () => 42);

    expect(outcome).toEqual({ status: 'done', value: 42 });
    expect(result.current.job).toBeNull();
  });

  it('exposes the active job with a renderer-generated id while work is running', async () => {
    const fake = createFakeApi();
    const { result } = renderHook(() => useJobRunner(fake.api));
    const pending = gate<string>();
    let seenJobId = '';

    let running!: Promise<JobRunResult<string>>;
    act(() => {
      running = result.current.run('export', (jobId) => {
        seenJobId = jobId;
        return pending.promise;
      });
    });

    expect(result.current.job).toMatchObject({ id: seenJobId, kind: 'export' });
    expect(seenJobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof result.current.job?.startedAt).toBe('number');

    await act(async () => {
      pending.resolve('written');
      await running;
    });
    expect(result.current.job).toBeNull();
  });

  it('updates stage and progress only for the current job id', async () => {
    const fake = createFakeApi();
    const { result } = renderHook(() => useJobRunner(fake.api));
    const pending = gate<void>();
    let jobId = '';

    let running!: Promise<JobRunResult<void>>;
    act(() => {
      running = result.current.run('transcribe', (id) => {
        jobId = id;
        return pending.promise;
      });
    });

    act(() => {
      fake.emitProgress({ jobId: 'some-other-job', stage: 'translating', progress: 0.9 });
    });
    expect(result.current.job?.stage).toBeUndefined();
    expect(result.current.job?.progress).toBeUndefined();

    act(() => {
      fake.emitProgress({ jobId, stage: 'transcribing', progress: 0.25 });
    });
    expect(result.current.job).toMatchObject({ stage: 'transcribing', progress: 0.25 });

    act(() => {
      fake.emitProgress({ jobId, stage: 'polishing' });
    });
    expect(result.current.job?.stage).toBe('polishing');
    expect(result.current.job?.progress).toBeUndefined();

    await act(async () => {
      pending.resolve();
      await running;
    });
  });

  it('ignores progress that arrives after the job finished', async () => {
    const fake = createFakeApi();
    const { result } = renderHook(() => useJobRunner(fake.api));
    let jobId = '';

    await act(async () => {
      await result.current.run('preview', async (id) => {
        jobId = id;
        return 'ok';
      });
    });
    act(() => {
      fake.emitProgress({ jobId, stage: 'rendering_video', progress: 0.5 });
    });

    expect(result.current.job).toBeNull();
  });

  it('returns stale when isStillValid is false after the work completes', async () => {
    const fake = createFakeApi();
    const { result } = renderHook(() => useJobRunner(fake.api));
    let projectStillOpen = true;

    const outcome = await result.current.run(
      'translate',
      async () => {
        projectStillOpen = false;
        return ['translated'];
      },
      { isStillValid: () => projectStillOpen }
    );

    expect(outcome).toEqual({ status: 'stale' });
  });

  it('returns done when isStillValid stays true', async () => {
    const fake = createFakeApi();
    const { result } = renderHook(() => useJobRunner(fake.api));

    const outcome = await result.current.run('translate', async () => 'value', { isStillValid: () => true });

    expect(outcome).toEqual({ status: 'done', value: 'value' });
  });

  it('maps AppError messages to code and detail, unwrapping the Electron IPC prefix', async () => {
    const fake = createFakeApi();
    const { result } = renderHook(() => useJobRunner(fake.api));

    const outcome = await result.current.run('transcribe', async () => {
      throw new Error("Error invoking remote method 'workflow:transcribe': Error: [PROVIDER_RATE_LIMITED] Too many requests");
    });

    expect(outcome).toEqual({ status: 'error', code: 'PROVIDER_RATE_LIMITED', detail: 'Too many requests' });
  });

  it('maps messages without an AppError code to UNKNOWN with the raw message', async () => {
    const fake = createFakeApi();
    const { result } = renderHook(() => useJobRunner(fake.api));

    const outcome = await result.current.run('export', async () => {
      throw new Error('socket closed');
    });

    expect(outcome).toEqual({ status: 'error', code: 'UNKNOWN', detail: 'socket closed' });
  });

  it('maps non-Error throws to UNKNOWN', async () => {
    const fake = createFakeApi();
    const { result } = renderHook(() => useJobRunner(fake.api));

    const outcome = await result.current.run('export', async () => {
      throw 'plain string';
    });

    expect(outcome).toEqual({ status: 'error', code: 'UNKNOWN', detail: 'plain string' });
  });

  it('returns stale instead of error when the job fails after the project changed', async () => {
    const fake = createFakeApi();
    const { result } = renderHook(() => useJobRunner(fake.api));
    let projectStillOpen = true;

    const outcome = await result.current.run(
      'transcribe',
      async () => {
        projectStillOpen = false;
        throw new Error('[PROVIDER_REQUEST_FAILED] boom');
      },
      { isStillValid: () => projectStillOpen }
    );

    expect(outcome).toEqual({ status: 'stale' });
  });

  it('maps JOB_CANCELED to canceled, even if the project also changed', async () => {
    const fake = createFakeApi();
    const { result } = renderHook(() => useJobRunner(fake.api));

    const outcome = await result.current.run(
      'transcribe',
      async () => {
        throw new Error('[JOB_CANCELED]');
      },
      { isStillValid: () => false }
    );

    expect(outcome).toEqual({ status: 'canceled' });
  });

  it('cancel() calls jobs.cancel with the active job id', async () => {
    const fake = createFakeApi();
    const { result } = renderHook(() => useJobRunner(fake.api));
    const pending = gate<string>();
    let jobId = '';

    let running!: Promise<JobRunResult<string>>;
    act(() => {
      running = result.current.run('transcribe', (id) => {
        jobId = id;
        return pending.promise;
      });
    });

    await act(async () => {
      await result.current.cancel();
    });
    expect(fake.cancel).toHaveBeenCalledTimes(1);
    expect(fake.cancel).toHaveBeenCalledWith(jobId);

    await act(async () => {
      pending.reject(new Error('[JOB_CANCELED]'));
      await running;
    });
  });

  it('cancel() is a no-op when no job is running', async () => {
    const fake = createFakeApi();
    const { result } = renderHook(() => useJobRunner(fake.api));

    await act(async () => {
      await result.current.cancel();
    });

    expect(fake.cancel).not.toHaveBeenCalled();
  });

  it('refuses a second run while busy and accepts runs again afterwards', async () => {
    const fake = createFakeApi();
    const { result } = renderHook(() => useJobRunner(fake.api));
    const pending = gate<string>();

    let first!: Promise<JobRunResult<string>>;
    act(() => {
      first = result.current.run('transcribe', () => pending.promise);
    });

    let second!: JobRunResult<string>;
    await act(async () => {
      second = await result.current.run('translate', async () => 'never');
    });
    expect(second).toEqual({ status: 'error', code: 'UNKNOWN', detail: 'busy' });
    expect(result.current.job?.kind).toBe('transcribe');

    await act(async () => {
      pending.resolve('first');
      await first;
    });

    const third = await result.current.run('translate', async () => 'third');
    expect(third).toEqual({ status: 'done', value: 'third' });
  });

  it('subscribes to progress once and unsubscribes on unmount', () => {
    const fake = createFakeApi();
    const { unmount } = renderHook(() => useJobRunner(fake.api));

    expect(fake.listenerCount()).toBe(1);
    unmount();
    expect(fake.listenerCount()).toBe(0);
  });

  it('runs work without progress or cancel support when no api is available', async () => {
    const { result } = renderHook(() => useJobRunner(undefined));

    const outcome = await result.current.run('preview', async () => 'local');
    expect(outcome).toEqual({ status: 'done', value: 'local' });
    await expect(result.current.cancel()).resolves.toBeUndefined();
  });
});
