import { useCallback, useEffect, useReducer, useRef, useState, type Dispatch } from 'react';
import { parseAppErrorMessage } from '../../../shared/errors';
import type { TajtlishaApi } from '../../../shared/types/ipc';
import type { ProjectDocument } from '../../../shared/types/project';
import {
  createEmptyProject,
  createProjectState,
  projectReducer,
  type ProjectAction,
  type ProjectState
} from './project-reducer';

export const AUTOSAVE_DELAY_MS = 800;

export type UseProjectStoreOptions = {
  /** Target language for the empty project created when nothing is saved. Read on mount only. */
  targetLanguage: string;
  /** Defaults to window.tajtlisha. Injected in tests. */
  api?: TajtlishaApi;
};

export type ProjectStore = {
  state: ProjectState;
  dispatch: Dispatch<ProjectAction>;
  /** True once the last saved project has been loaded (or loading failed). */
  ready: boolean;
  /** Message from the last failed load or save. Cleared on a successful save. */
  saveError: string | null;
};

type PendingSave = { project: ProjectDocument; revision: number };

export function useProjectStore(options: UseProjectStoreOptions): ProjectStore {
  const { targetLanguage } = options;
  const api = options.api ?? getWindowApi();

  const [state, dispatch] = useReducer(projectReducer, targetLanguage, (language) =>
    createProjectState(createEmptyProject({ targetLanguage: language }))
  );
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Project object returned by loadLast. Its identity marks the revision that
  // came from disk, so it is not written back right after load.
  const loadedProjectRef = useRef<ProjectDocument | null>(null);
  // Starts at the initial revision: the empty project is not persisted until edited.
  const savedRevisionRef = useRef(state.revision);
  // Set when loading failed. Autosave stays off so an empty project never overwrites the saved file.
  const persistBlockedRef = useRef(false);
  const pendingRef = useRef<PendingSave | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending || !api) return;
    pendingRef.current = null;

    persistProject(api, pending.project).then(
      () => {
        savedRevisionRef.current = Math.max(savedRevisionRef.current, pending.revision);
        setSaveError(null);
      },
      (error: unknown) => {
        // Keep the snapshot so the next edit or unload retries it.
        if (!pendingRef.current) pendingRef.current = pending;
        setSaveError(toErrorMessage(error));
      }
    );
  }, [api]);

  useEffect(() => {
    if (!api) {
      setReady(true);
      return;
    }
    let cancelled = false;
    api.project.loadLast().then(
      (project) => {
        if (cancelled) return;
        if (project) {
          loadedProjectRef.current = project;
          dispatch({ type: 'project/replace', project });
        }
        setReady(true);
      },
      (error: unknown) => {
        if (cancelled) return;
        persistBlockedRef.current = true;
        setSaveError(toErrorMessage(error));
        setReady(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    if (!ready || !api || persistBlockedRef.current) return;

    if (state.project === loadedProjectRef.current) {
      loadedProjectRef.current = null;
      savedRevisionRef.current = state.revision;
      return;
    }
    if (state.revision === savedRevisionRef.current) return;

    pendingRef.current = { project: state.project, revision: state.revision };
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, AUTOSAVE_DELAY_MS);
  }, [api, flush, ready, state.project, state.revision]);

  useEffect(() => {
    const handleBeforeUnload = () => flush();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flush();
    };
  }, [flush]);

  return { state, dispatch, ready, saveError };
}

async function persistProject(api: TajtlishaApi, project: ProjectDocument): Promise<void> {
  await api.project.save(project);
}

function getWindowApi(): TajtlishaApi | undefined {
  return typeof window === 'undefined' ? undefined : window.tajtlisha;
}

/** Strips the Electron IPC wrapper and returns the AppError code, or its detail when present. */
function toErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const parsed = parseAppErrorMessage(raw);
  return parsed.detail ?? parsed.code;
}
