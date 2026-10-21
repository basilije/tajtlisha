import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectDocument } from '../../../src/shared/types/project';
import { createEmptyProject } from '../../../src/renderer/src/state/project-reducer';
import { AUTOSAVE_DELAY_MS, useProjectStore } from '../../../src/renderer/src/state/useProjectStore';
import { createFakeApi, type FakeApi } from './fakeApi';

function savedProject(): ProjectDocument {
  return { ...createEmptyProject({ targetLanguage: 'en' }), id: 'saved-1' };
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
  });

  it('starts not ready and becomes ready after loadLast resolves with a saved project', async () => {
    fake.loadLast.mockResolvedValue(savedProject());

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
    fake.loadLast.mockResolvedValue(savedProject());

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
    fake.loadLast.mockResolvedValue({
      ...savedProject(),
      source: {
        inputPath: '/clips/a.mp4',
        fileUrl: 'tajtlisha-media://old',
        durationMs: 5000,
        width: 1,
        height: 1,
        hasAudio: false
      }
    });
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
      .mockResolvedValue(undefined);
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
    fake.save.mockRejectedValueOnce(new Error('[UNKNOWN] offline')).mockResolvedValue(undefined);
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
    expect(result.current.saveError).toBe('corrupt file');

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
});
