/* @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { AppError } from '../../../src/shared/errors';
import { IPC_CHANNELS } from '../../../src/shared/types/ipc';
import { JobRegistry, PROGRESS_THROTTLE_MS, runJob, type JobOwner } from '../../../src/main/jobs/job-registry';

type FakeOwner = JobOwner & { sent: Array<{ channel: string; payload: unknown }> };

function fakeOwner(id: number): FakeOwner {
  const sent: FakeOwner['sent'] = [];
  return {
    id,
    sent,
    send(channel, payload) {
      sent.push({ channel, payload });
    }
  };
}

function fakeClock(start = 1000) {
  let time = start;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    }
  };
}

/** Lets pending promise callbacks (including a cancel waiting on finish) run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('JobRegistry', () => {
  it('rejects a duplicate active job id from the same window but allows it from another', () => {
    const registry = new JobRegistry();
    registry.start('job-1', fakeOwner(1));

    expect(() => registry.start('job-1', fakeOwner(1))).toThrow(AppError);
    expect(() => registry.start('job-1', fakeOwner(1))).toThrow('[UNKNOWN] duplicate job id');
    expect(() => registry.start('job-1', fakeOwner(2))).not.toThrow();
  });

  it('frees a job id once the job has finished', () => {
    const registry = new JobRegistry();
    const first = registry.start('job-1', fakeOwner(1));
    first.finish();
    first.finish();

    expect(() => registry.start('job-1', fakeOwner(1))).not.toThrow();
  });

  it('cancels only the owner\'s job and treats unknown ids as a no-op', async () => {
    const registry = new JobRegistry();
    const mine = registry.start('job-1', fakeOwner(1));
    const theirs = registry.start('job-1', fakeOwner(2));

    const cancellation = registry.cancel('job-1', 1);
    expect(mine.signal.aborted).toBe(true);
    expect(theirs.signal.aborted).toBe(false);
    mine.finish();
    await cancellation;

    await expect(registry.cancel('missing', 1)).resolves.toBeUndefined();
    theirs.finish();
  });

  it('resolves cancel only after the job has finished', async () => {
    const registry = new JobRegistry();
    const job = registry.start('job-1', fakeOwner(1));
    let resolved = false;
    const cancellation = registry.cancel('job-1', 1).then(() => {
      resolved = true;
    });

    await settle();
    expect(job.signal.aborted).toBe(true);
    expect(resolved).toBe(false);

    job.finish();
    await cancellation;
    expect(resolved).toBe(true);
  });

  it('cancelAllFor aborts every job of one window and no other', () => {
    const registry = new JobRegistry();
    const a = registry.start('a', fakeOwner(1));
    const b = registry.start('b', fakeOwner(1));
    const other = registry.start('c', fakeOwner(2));

    registry.cancelAllFor(1);

    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(true);
    expect(other.signal.aborted).toBe(false);
    registry.cancelAllFor(99);
  });

  it('sends progress on jobs:progress to the owner with the job id', () => {
    const registry = new JobRegistry(fakeClock().now);
    const owner = fakeOwner(1);
    const job = registry.start('job-1', owner);

    job.report('extracting_audio');

    expect(owner.sent).toEqual([
      { channel: IPC_CHANNELS.jobsProgress, payload: { jobId: 'job-1', stage: 'extracting_audio', progress: undefined } }
    ]);
    job.finish();
  });

  it('throttles same-stage progress but always sends stage changes immediately', () => {
    const clock = fakeClock();
    const registry = new JobRegistry(clock.now);
    const owner = fakeOwner(1);
    const job = registry.start('job-1', owner);

    job.report('rendering_video', 0.1);
    clock.advance(PROGRESS_THROTTLE_MS - 1);
    job.report('rendering_video', 0.2);
    job.report('writing_srt');
    clock.advance(PROGRESS_THROTTLE_MS);
    job.report('writing_srt', 0.5);

    const sent = owner.sent.map((message) => (message.payload as { stage: string; progress?: number }));
    expect(sent.map((payload) => [payload.stage, payload.progress])).toEqual([
      ['rendering_video', 0.1],
      ['writing_srt', undefined],
      ['writing_srt', 0.5]
    ]);
    job.finish();
  });

  it('ignores reports after finish and survives a destroyed window', () => {
    const clock = fakeClock();
    const registry = new JobRegistry(clock.now);
    const destroyed: JobOwner = {
      id: 1,
      send() {
        throw new Error('Object has been destroyed');
      }
    };
    const job = registry.start('job-1', destroyed);

    expect(() => job.report('transcribing', 0.3)).not.toThrow();
    job.finish();

    const owner = fakeOwner(1);
    const next = registry.start('job-2', owner);
    next.finish();
    next.report('transcribing', 0.9);
    expect(owner.sent).toEqual([]);
  });
});

describe('runJob', () => {
  it('passes the signal and progress hook, returns the result and always finishes the job', async () => {
    const clock = fakeClock();
    const registry = new JobRegistry(clock.now);
    const owner = fakeOwner(1);

    const result = await runJob(registry, owner, 'job-1', async ({ signal, onProgress }) => {
      expect(signal.aborted).toBe(false);
      onProgress({ stage: 'transcribing', progress: 0.25 });
      return 'done';
    });

    expect(result).toBe('done');
    expect(owner.sent).toHaveLength(1);
    // Finished, so the id can be used again.
    expect(() => registry.start('job-1', owner)).not.toThrow();
  });

  it('finishes the job when the work fails and keeps the service error', async () => {
    const registry = new JobRegistry();
    const owner = fakeOwner(1);

    await expect(
      runJob(registry, owner, 'job-1', async () => {
        throw new AppError('NO_SPEECH');
      })
    ).rejects.toThrow('[NO_SPEECH]');
    expect(() => registry.start('job-1', owner)).not.toThrow();
  });

  it('rejects with JOB_CANCELED when the job is aborted, even if the service reports another error', async () => {
    const registry = new JobRegistry();
    const owner = fakeOwner(1);

    const running = runJob(
      registry,
      owner,
      'job-1',
      ({ signal }) =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('child process killed by SIGTERM')));
        })
    );

    await registry.cancel('job-1', 1);
    await expect(running).rejects.toThrow('[JOB_CANCELED]');
  });
});
