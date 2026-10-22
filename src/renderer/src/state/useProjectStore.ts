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

/** Outcome of a flush. `error` is the detail of the failed write; the write stays pending for retry. */
export type SaveResult = { ok: true } | { ok: false; error: string };

export type ProjectStore = {
  state: ProjectState;
  dispatch: (action: ProjectAction) => void;
  /** True once the last saved project has been loaded (or loading failed). */
  ready: boolean;
  /** Message from the last failed save. Cleared on a successful save. */
  saveError: string | null;
  /**
   * Message from the last failed load. While set, the saved project is not
   * loaded and autosave is off. Opening a video starts a new project and clears it.
   */
  loadError: string | null;
  /** Loads the saved project again after a failed load. */
  retryLoad: () => void;
  /**
   * Video status from the last load. 'missing' and 'changed' mean the video
   * should be relinked. Null when no saved project was loaded. Becomes 'ok'
   * after source/set or source/relink.
   */
  sourceStatus: SourceStatus | null;
  /** True when edits exist that the last successful save did not cover. A failed save keeps this true. */
  isDirty: boolean;
  /**
   * Writes the latest pending edit now and resolves when the write settles.
   * Never rejects: a failed write is kept for retry and reported through
   * saveError and the result.
   */
  flush: () => Promise<SaveResult>;
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
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bumped by retryLoad to run the load effect again.
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [sourceStatus, setSourceStatus] = useState<SourceStatus | null>(null);
  // Mirrors savedRevisionRef for rendering. The ref drives autosave logic.
  const [savedRevision, setSavedRevision] = useState(state.revision);

  // Highest revision known to be on disk. Starts at the initial revision: the
  // empty project is not persisted until edited. Set to the loaded revision on load.
  const savedRevisionRef = useRef(state.revision);
  // Set when loading failed. Autosave stays off so an empty project never overwrites the saved file.
  const persistBlockedRef = useRef(false);
  // Set by any user action. A late load must not replace a project the user already changed.
  const changedRef = useRef(false);
  // Always the highest unsaved revision. A failed write keeps it; a newer edit replaces it.
  const pendingRef = useRef<PendingSave | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The write in flight. Writes run one at a time, so a later flush waits for it.
  const inFlightRef = useRef<Promise<SaveResult> | null>(null);

  const markSaved = useCallback((revision: number) => {
    savedRevisionRef.current = Math.max(savedRevisionRef.current, revision);
    setSavedRevision(savedRevisionRef.current);
  }, []);

  // Writes the highest pending revision until nothing newer is waiting. A failure stops here and
  // leaves the pending snapshot in place, so Retry writes the newest edit and never an older one.
  const writePending = useCallback(async (): Promise<SaveResult> => {
    for (;;) {
      const pending = pendingRef.current;
      if (!pending) return { ok: true };
      if (!api) return { ok: true };

      if (pending.revision > savedRevisionRef.current) {
        try {
          const result = await api.project.save(pending.project);
          markSaved(result.savedRevision);
          setSaveError(null);
        } catch (error) {
          const message = toErrorMessage(error);
          setSaveError(message);
          return { ok: false, error: message };
        }
      }
      // Only clear the snapshot that was written. An edit made during the write stays pending.
      if (pendingRef.current === pending) pendingRef.current = null;
    }
  }, [api, markSaved]);

  const flush = useCallback((): Promise<SaveResult> => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Called synchronously when idle, so unload and quit handlers reach main before the window goes away.
    const previous = inFlightRef.current;
    const run = previous ? previous.then(() => writePending()) : writePending();
    inFlightRef.current = run;
    void run.then(() => {
      if (inFlightRef.current === run) inFlightRef.current = null;
    });
    return run;
  }, [writePending]);

  const dispatch = useCallback((action: ProjectAction) => {
    if (action.type === 'source/set' || action.type === 'source/relink') {
      // A new or relinked video is playable, so a missing/changed warning no longer applies.
      setSourceStatus((current) => (current === null ? null : 'ok'));
    }
    if (action.type === 'source/set' && persistBlockedRef.current) {
      // Starting a new project after a failed load. The project in memory was created at
      // mount with its own id, which is not on disk, so the saved file stays untouched.
      persistBlockedRef.current = false;
      setLoadError(null);
    }
    changedRef.current = true;
    rawDispatch(action);
  }, []);

  const retryLoad = useCallback(() => {
    setLoadError(null);
    setReady(false);
    setLoadAttempt((attempt) => attempt + 1);
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
        persistBlockedRef.current = false;
        setLoadError(null);
        // Never replace a project the user already changed (for example a clip opened before this load).
        if (result && !changedRef.current) {
          // The loaded revision is what is on disk, so nothing is dirty right after load.
          rawDispatch({ type: 'project/replace', project: result.project });
          markSaved(result.project.revision);
          setSourceStatus(result.sourceStatus);
        }
        setReady(true);
      },
      (error: unknown) => {
        if (cancelled) return;
        persistBlockedRef.current = true;
        setLoadError(toErrorMessage(error));
        setReady(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [api, markSaved, loadAttempt]);

  useEffect(() => {
    if (!ready || !api || persistBlockedRef.current) return;
    if (state.revision <= savedRevisionRef.current) return;

    pendingRef.current = { project: state.project, revision: state.revision };
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  }, [api, flush, ready, state.project, state.revision]);

  useEffect(() => {
    const handleBeforeUnload = () => void flush();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      void flush();
    };
  }, [flush]);

  return {
    state,
    dispatch,
    ready,
    saveError,
    loadError,
    retryLoad,
    sourceStatus,
    isDirty: state.revision > savedRevision,
    flush
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
