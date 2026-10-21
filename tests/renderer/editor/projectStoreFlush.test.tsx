import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useProjectStore } from '../../../src/renderer/src/state/useProjectStore';
import { createFakeApi } from '../state/fakeApi';

describe('useProjectStore.flush', () => {
  it('writes the pending edit and resolves after the save settles', async () => {
    const fake = createFakeApi();
    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'sr-Latn', api: fake.api }));
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => result.current.dispatch({ type: 'languages/set', targetLanguage: 'en' }));
    await act(() => result.current.flush());

    expect(fake.save).toHaveBeenCalledTimes(1);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.saveError).toBeNull();
  });

  it('keeps a failed write for retry and reports the error', async () => {
    const fake = createFakeApi();
    fake.save.mockRejectedValueOnce(new Error('disk full'));
    const { result } = renderHook(() => useProjectStore({ targetLanguage: 'sr-Latn', api: fake.api }));
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => result.current.dispatch({ type: 'languages/set', targetLanguage: 'en' }));
    await act(() => result.current.flush());

    expect(result.current.saveError).toBe('disk full');
    expect(result.current.isDirty).toBe(true);

    await act(() => result.current.flush());

    expect(fake.save).toHaveBeenCalledTimes(2);
    expect(result.current.saveError).toBeNull();
    expect(result.current.isDirty).toBe(false);
  });
});
