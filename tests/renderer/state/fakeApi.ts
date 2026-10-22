import { vi } from 'vitest';
import type { TajtlishaApi } from '../../../src/shared/types/ipc';
import type { JobProgressEvent } from '../../../src/shared/types/jobs';
import type { ProjectDocument, ProjectLoadResult } from '../../../src/shared/types/project';

export type FakeApi = {
  api: TajtlishaApi;
  loadLast: ReturnType<typeof vi.fn<() => Promise<ProjectLoadResult | null>>>;
  save: ReturnType<typeof vi.fn<(project: ProjectDocument) => Promise<{ savedRevision: number }>>>;
  cancel: ReturnType<typeof vi.fn<(jobId: string) => Promise<void>>>;
  emitProgress: (event: JobProgressEvent) => void;
  listenerCount: () => number;
};

/** Minimal stand-in for window.tajtlisha covering only the calls the state hooks make. */
export function createFakeApi(): FakeApi {
  const listeners = new Set<(event: JobProgressEvent) => void>();
  const loadLast = vi.fn<() => Promise<ProjectLoadResult | null>>(() => Promise.resolve(null));
  // Like main: the saved revision is the one written.
  const save = vi.fn<(project: ProjectDocument) => Promise<{ savedRevision: number }>>((project) =>
    Promise.resolve({ savedRevision: project.revision })
  );
  const cancel = vi.fn<(jobId: string) => Promise<void>>(() => Promise.resolve());

  const api = {
    project: { loadLast, save },
    jobs: {
      cancel,
      onProgress: (listener: (event: JobProgressEvent) => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }
    }
  } as unknown as TajtlishaApi;

  return {
    api,
    loadLast,
    save,
    cancel,
    emitProgress: (event) => {
      for (const listener of [...listeners]) listener(event);
    },
    listenerCount: () => listeners.size
  };
}
