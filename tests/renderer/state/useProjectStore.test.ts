import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectDocument, ProjectLoadResult, ProjectSource } from '../../../src/shared/types/project';
import { createEmptyProject } from '../../../src/renderer/src/state/project-reducer';
import { AUTOSAVE_DELAY_MS, useProjectStore } from '../../../src/renderer/src/state/useProjectStore';
import { createFakeApi, type FakeApi } from './fakeApi';

function savedProject(): ProjectDocument {
  return { ...createEmptyProject({ targetLanguage: 'en' }), id: 'saved-1', revision: 1 };
}

function clipSource(inputPath: string): ProjectSource {
  return {
    inputPath,
    fileUrl: 'tajtlisha-media://clip',
    durationMs: 5000,
    width: 1,
    height: 1,
    hasAudio: false,
    fileSizeBytes: 1000,
    mtimeMs: 1700000000000
  };
}

function loaded(project: ProjectDocument = savedProject(), sourceStatus: ProjectLoadResult['sourceStatus'] = 'ok'): ProjectLoadResult {
  return { project, sourceStatus };
}

async function flushPromises(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('useProjectStore', () => {
  let fake: FakeApi;

  beforeEach(() => {
    fake = createFakeApi();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts not ready and becomes ready after loadLast resolves with a saved project', async () => {
    fake.loadLast.mockResolvedValue(loaded());

    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'sr-Latn', api: fake.api }));
    expect(result.current.ready).toBe(false);

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.state.project.id).toBe('saved-1');
    expect(result.current.state.revision).toBe(1);
    expect(result.current.state.past).toHaveLength(0);
  });

  it('keeps the empty project for the given target language when nothing is saved', async () => {
    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'sr-Latn', api: fake.api }));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.state.project.targetLanguage).toBe('sr-Latn');
    expect(result.current.state.project.source).toBeNull();
    expect(result.current.state.revision).toBe(0);
  });

  it('does not write the freshly loaded project back to disk', async () => {
    vi.useFakeTimers();
    fake.loadLast.mockResolvedValue(loaded());

    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));
    await flushPromises();
    expect(result.current.ready).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3);
    });
    expect(fake.save).not.toHaveBeenCalled();
  });

  it('becomes ready without any api and never saves', async () => {
    vi.useFakeTimers();
    // Other suites may leave window.tajtlisha set; "no api" must mean no api here.
    vi.stubGlobal('tajtlisha', undefined);
    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'en', api: undefined }));
    await flushPromises();
    expect(result.current.ready).toBe(true);

    act(() => {
      result.current.dispatch({ type: 'style/set', patch: { fontSizePercent: 6 } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    });
    expect(result.current.saveError).toBeNull();
  });

  it('debounces autosave by 800 ms and coalesces bursts into one save', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));
    await flushPromises();

    act(() => {
      result.current.dispatch({ type: 'style/set', patch: { fontSizePercent: 6 } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    });
    act(() => {
      result.current.dispatch({ type: 'style/set', patch: { fontSizePercent: 7 } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    });
    expect(fake.save).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fake.save).toHaveBeenCalledTimes(1);
    expect(fake.save.mock.calls[0][0].style.fontSizePercent).toBe(7);
  });

  it('does not save for source/updateUrl, which is not a content change', async () => {
    vi.useFakeTimers();
    fake.loadLast.mockResolvedValue(loaded({
      ...savedProject(),
      source: {
        inputPath: '/clips/a.mp4',
        fileUrl: 'tajtlisha-media://old',
        durationMs: 5000,
        width: 1,
        height: 1,
        hasAudio: false,
        fileSizeBytes: 1000,
        mtimeMs: 1700000000000
      }
    }));
    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));
    await flushPromises();

    act(() => {
      result.current.dispatch({ type: 'source/updateUrl', fileUrl: 'tajtlisha-media://fresh' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    });
    expect(fake.save).not.toHaveBeenCalled();
  });

  it('does not save again after a successful save until something changes', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));
    await flushPromises();

    act(() => {
      result.current.dispatch({ type: 'style/set', patch: { fontSizePercent: 6 } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });
    await flushPromises();
    expect(fake.save).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 3);
    });
    expect(fake.save).toHaveBeenCalledTimes(1);
  });

  it('records saveError with the unwrapped detail and clears it after the next successful save', async () => {
    vi.useFakeTimers();
    fake.save
      .mockRejectedValueOnce(new Error("Error invoking remote method 'project:save': Error: [UNKNOWN] disk full"))
      .mockImplementation((project) => Promise.resolve({ savedRevision: project.revision }));
    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));
    await flushPromises();

    act(() => {
      result.current.dispatch({ type: 'style/set', patch: { fontSizePercent: 6 } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });
    await flushPromises();
    expect(result.current.saveError).toBe('disk full');

    act(() => {
      result.current.dispatch({ type: 'style/set', patch: { fontSizePercent: 8 } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });
    await flushPromises();
    expect(result.current.saveError).toBeNull();
    expect(fake.save).toHaveBeenCalledTimes(2);
  });

  it('keeps unsaved work pending after a failed save so unload retries it', async () => {
    vi.useFakeTimers();
    fake.save.mockRejectedValueOnce(new Error('[UNKNOWN] offline')).mockImplementation((project) => Promise.resolve({ savedRevision: project.revision }));
    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));
    await flushPromises();

    act(() => {
      result.current.dispatch({ type: 'style/set', patch: { fontSizePercent: 6 } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });
    await flushPromises();
    expect(fake.save).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });
    await flushPromises();
    expect(fake.save).toHaveBeenCalledTimes(2);
  });

  it('flushes a pending save immediately on beforeunload', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));
    await flushPromises();

    act(() => {
      result.current.dispatch({ type: 'style/set', patch: { fontSizePercent: 6 } });
    });
    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });
    expect(fake.save).toHaveBeenCalledTimes(1);
    expect(fake.save.mock.calls[0][0].style.fontSizePercent).toBe(6);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    });
    expect(fake.save).toHaveBeenCalledTimes(1);
  });

  it('flushes a pending save when unmounted', async () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));
    await flushPromises();

    act(() => {
      result.current.dispatch({ type: 'style/set', patch: { fontSizePercent: 6 } });
    });
    unmount();

    expect(fake.save).toHaveBeenCalledTimes(1);
  });

  it('blocks autosave when loading fails so an empty project cannot overwrite the saved file', async () => {
    vi.useFakeTimers();
    fake.loadLast.mockRejectedValue(new Error("Error invoking remote method 'project:loadLast': Error: [UNKNOWN] corrupt file"));
    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));
    await flushPromises();

    expect(result.current.ready).toBe(true);
    expect(result.current.loadError).toBe('corrupt file');
    expect(result.current.saveError).toBeNull();

    act(() => {
      result.current.dispatch({ type: 'style/set', patch: { fontSizePercent: 6 } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    });
    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });
    expect(fake.save).not.toHaveBeenCalled();
  });

  it('keeps a manually edited project when a delayed load resolves afterwards', async () => {
    vi.useFakeTimers();
    let resolveLoad: (value: ProjectLoadResult | null) => void = () => undefined;
    fake.loadLast.mockReturnValue(new Promise((resolve) => (resolveLoad = resolve)));
    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));

    act(() => {
      result.current.dispatch({ type: 'source/set', source: clipSource('/clips/new.mp4') });
    });
    await act(async () => {
      resolveLoad(loaded(savedProject()));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.ready).toBe(true);
    expect(result.current.state.project.id).not.toBe('saved-1');
    expect(result.current.state.project.source?.inputPath).toBe('/clips/new.mp4');
  });

  it('keeps the saved file untouched after a failed load until a new project is started, then autosaves the new one', async () => {
    vi.useFakeTimers();
    fake.loadLast.mockRejectedValueOnce(new Error("Error invoking remote method 'project:loadLast': Error: [UNKNOWN] corrupt file"));
    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));
    await flushPromises();
    expect(result.current.loadError).toBe('corrupt file');

    // Edits alone do not write: the blank project is not the saved one.
    act(() => {
      result.current.dispatch({ type: 'style/set', patch: { fontSizePercent: 6 } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS * 2);
    });
    expect(fake.save).not.toHaveBeenCalled();

    act(() => {
      result.current.dispatch({ type: 'source/set', source: clipSource('/clips/new.mp4') });
    });
    expect(result.current.loadError).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });
    await flushPromises();

    expect(fake.save).toHaveBeenCalledTimes(1);
    expect(fake.save.mock.calls[0][0].id).not.toBe('saved-1');
    expect(fake.save.mock.calls[0][0].source?.inputPath).toBe('/clips/new.mp4');
  });

  it('Retry loads the saved project again and applies it when the load succeeds', async () => {
    fake.loadLast.mockRejectedValueOnce(new Error('[UNKNOWN] corrupt file')).mockResolvedValueOnce(loaded());
    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));
    await waitFor(() => expect(result.current.loadError).toBe('corrupt file'));

    act(() => result.current.retryLoad());
    expect(result.current.ready).toBe(false);
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(fake.loadLast).toHaveBeenCalledTimes(2);
    expect(result.current.loadError).toBeNull();
    expect(result.current.state.project.id).toBe('saved-1');
    expect(result.current.isDirty).toBe(false);
  });

  it('keeps the highest pending revision when two saves fail, so Retry does not write the older one', async () => {
    vi.useFakeTimers();
    fake.save.mockRejectedValueOnce(new Error('[UNKNOWN] disk full')).mockRejectedValueOnce(new Error('[UNKNOWN] disk full'));
    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));
    await flushPromises();

    act(() => {
      result.current.dispatch({ type: 'style/set', patch: { fontSizePercent: 6 } });
    });
    let first: Promise<unknown> = Promise.resolve();
    act(() => {
      first = result.current.flush();
    });
    act(() => {
      result.current.dispatch({ type: 'style/set', patch: { fontSizePercent: 9 } });
    });
    let second: Promise<unknown> = Promise.resolve();
    act(() => {
      second = result.current.flush();
    });
    await act(async () => {
      await Promise.all([first, second]);
    });
    expect(fake.save).toHaveBeenCalledTimes(2);

    await act(() => result.current.flush());
    expect(fake.save).toHaveBeenCalledTimes(3);
    expect(fake.save.mock.calls[2][0].style.fontSizePercent).toBe(9);
    expect(result.current.isDirty).toBe(false);
  });

  it('serializes saves: a second flush waits for the write in flight', async () => {
    vi.useFakeTimers();
    let finishFirst: (value: { savedRevision: number }) => void = () => undefined;
    fake.save.mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)));
    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));
    await flushPromises();

    act(() => {
      result.current.dispatch({ type: 'style/set', patch: { fontSizePercent: 6 } });
    });
    act(() => {
      void result.current.flush();
    });
    act(() => {
      result.current.dispatch({ type: 'style/set', patch: { fontSizePercent: 9 } });
    });
    act(() => {
      void result.current.flush();
    });
    expect(fake.save).toHaveBeenCalledTimes(1);

    await act(async () => {
      // The first write covered revision 1; revision 2 (the newer edit) is still pending.
      finishFirst({ savedRevision: 1 });
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fake.save).toHaveBeenCalledTimes(2);
    expect(fake.save.mock.calls[1][0].style.fontSizePercent).toBe(9);
  });

  it('flush resolves with ok when saved and with the error detail when the write fails', async () => {
    fake.save.mockRejectedValueOnce(new Error("Error invoking remote method 'project:save': Error: [UNKNOWN] disk full"));
    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => {
      result.current.dispatch({ type: 'style/set', patch: { fontSizePercent: 6 } });
    });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.flush();
    });
    expect(outcome).toEqual({ ok: false, error: 'disk full' });

    let retried: unknown;
    await act(async () => {
      retried = await result.current.flush();
    });
    expect(retried).toEqual({ ok: true });
  });

  it('exposes the load sourceStatus, and null when nothing was saved', async () => {
    fake.loadLast.mockResolvedValue(loaded(savedProject(), 'missing'));
    const withSaved = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));
    await waitFor(() => expect(withSaved.result.current.ready).toBe(true));
    expect(withSaved.result.current.sourceStatus).toBe('missing');

    fake.loadLast.mockResolvedValue(null);
    const withoutSaved = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));
    await waitFor(() => expect(withoutSaved.result.current.ready).toBe(true));
    expect(withoutSaved.result.current.sourceStatus).toBeNull();
  });

  it('continues from the loaded revision and is not dirty right after load', async () => {
    fake.loadLast.mockResolvedValue(loaded({ ...savedProject(), revision: 7 }, 'changed'));
    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));
    await waitFor(() => expect(result.current.ready).toBe(true));

    expect(result.current.state.revision).toBe(7);
    expect(result.current.state.project.revision).toBe(7);
    expect(result.current.isDirty).toBe(false);
  });

  it('is dirty after an edit and clean again once the save succeeds', async () => {
    vi.useFakeTimers();
    fake.loadLast.mockResolvedValue(loaded());
    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));
    await flushPromises();
    expect(result.current.isDirty).toBe(false);

    act(() => {
      result.current.dispatch({ type: 'style/set', patch: { fontSizePercent: 6 } });
    });
    expect(result.current.isDirty).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });
    await flushPromises();
    expect(fake.save.mock.calls[0][0].revision).toBe(2);
    expect(result.current.isDirty).toBe(false);
  });

  it('stays dirty after a failed save', async () => {
    vi.useFakeTimers();
    fake.save.mockRejectedValueOnce(new Error('[UNKNOWN] offline'));
    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));
    await flushPromises();

    act(() => {
      result.current.dispatch({ type: 'style/set', patch: { fontSizePercent: 6 } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    });
    await flushPromises();
    expect(result.current.saveError).toBe('offline');
    expect(result.current.isDirty).toBe(true);
  });

  it('relink clears a missing or changed status, and a new import keeps null as null', async () => {
    fake.loadLast.mockResolvedValue(loaded(savedProject(), 'missing'));
    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));
    await waitFor(() => expect(result.current.ready).toBe(true));

    const relinkSource = {
      inputPath: '/clips/moved.mp4',
      fileUrl: 'tajtlisha-media://moved',
      durationMs: 5000,
      width: 1,
      height: 1,
      hasAudio: false,
      fileSizeBytes: 1000,
      mtimeMs: 1700000000000
    };
    act(() => {
      result.current.dispatch({ type: 'source/relink', source: relinkSource });
    });
    expect(result.current.sourceStatus).toBe('ok');
    expect(result.current.state.project.source?.inputPath).toBe('/clips/moved.mp4');

    fake.loadLast.mockResolvedValue(null);
    const fresh = renderHook(() => useProjectStore({ targetLanguage: 'en', api: fake.api }));
    await waitFor(() => expect(fresh.result.current.ready).toBe(true));
    act(() => {
      fresh.result.current.dispatch({ type: 'source/set', source: relinkSource });
    });
    expect(fresh.result.current.sourceStatus).toBeNull();
  });
});
