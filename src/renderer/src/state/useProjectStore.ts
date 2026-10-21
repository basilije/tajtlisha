import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { parseAppErrorMessage } from '../../../shared/errors';
import type { TajtlishaApi } from '../../../shared/types/ipc';
import type { ProjectDocument, ProjectLoadResult } from '../../../shared/types/project';
import {
  createEmptyProject,
  createProjectState,
  projectReducer,
  type ProjectAction,
  type ProjectState
} from './project-reducer';

export const AUTOSAVE_DELAY_MS = 800;

export type SourceStatus = ProjectLoadResult['sourceStatus'];

export type UseProjectStoreOptions = {
  /** Target language for the empty project created when nothing is saved. Read on mount only. */
  targetLanguage: string;
  /** Defaults to window.tajtlisha. Injected in tests. */
  api?: TajtlishaApi;
};

export type ProjectStore = {
  state: ProjectState;
  dispatch: (action: ProjectAction) => void;
  /** True once the last saved project has been loaded (or loading failed). */
  ready: boolean;
  /** Message from the last failed load or save. Cleared on a successful save. */
  saveError: string | null;
  /**
   * Video status from the last load. 'missing' and 'changed' mean the video
   * should be relinked. Null when no saved project was loaded. Becomes 'ok'
   * after source/set or source/relink.
   */
  sourceStatus: SourceStatus | null;
  /** True when edits exist that the last successful save did not cover. A failed save keeps this true. */
  isDirty: boolean;
};

type PendingSave = { project: ProjectDocument; revision: number };

export function useProjectStore(options: UseProjectStoreOptions): ProjectStore {
  const { targetLanguage } = options;
  const api = options.api ?? getWindowApi();

  const [state, rawDispatch] = useReducer(projectReducer, targetLanguage, (language) =>
    createProjectState(createEmptyProject({ targetLanguage: language }))
  );
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [sourceStatus, setSourceStatus] = useState<SourceStatus | null>(null);
  // Mirrors savedRevisionRef for rendering. The ref drives autosave logic.
  const [savedRevision, setSavedRevision] = useState(state.revision);

  // Highest revision known to be on disk. Starts at the initial revision: the
  // empty project is not persisted until edited. Set to the loaded revision on load.
  const savedRevisionRef = useRef(state.revision);
  // Set when loading failed. Autosave stays off so an empty project never overwrites the saved file.
  const persistBlockedRef = useRef(false);
  const pendingRef = useRef<PendingSave | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markSaved = useCallback((revision: number) => {
    savedRevisionRef.current = Math.max(savedRevisionRef.current, revision);
    setSavedRevision(savedRevisionRef.current);
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending || !api) return;
    pendingRef.current = null;

    api.project.save(pending.project).then(
      (result) => {
        markSaved(result.savedRevision);
        setSaveError(null);
      },
      (error: unknown) => {
        // Keep the snapshot so the next edit or unload retries it.
        if (!pendingRef.current) pendingRef.current = pending;
        setSaveError(toErrorMessage(error));
      }
    );
  }, [api, markSaved]);

  const dispatch = useCallback((action: ProjectAction) => {
    if (action.type === 'source/set' || action.type === 'source/relink') {
      // A new or relinked video is playable, so a missing/changed warning no longer applies.
      setSourceStatus((current) => (current === null ? null : 'ok'));
    }
    rawDispatch(action);
  }, []);

  useEffect(() => {
    if (!api) {
      setReady(true);
      return;
    }
    let cancelled = false;
    api.project.loadLast().then(
      (result) => {
        if (cancelled) return;
        if (result) {
          // The loaded revision is what is on disk, so nothing is dirty right after load.
          dispatch({ type: 'project/replace', project: result.project });
          markSaved(result.project.revision);
          setSourceStatus(result.sourceStatus);
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
  }, [api, dispatch, markSaved]);

  useEffect(() => {
    if (!ready || !api || persistBlockedRef.current) return;
    if (state.revision <= savedRevisionRef.current) return;

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

  return {
    state,
    dispatch,
    ready,
    saveError,
    sourceStatus,
    isDirty: state.revision > savedRevision
  };
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
