import type { ReactNode } from 'react';
import { createElement } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppRuntime } from '../../../src/renderer/src/hooks/useAppRuntime';
import { createI18n } from '../../../src/renderer/src/i18n';
import { mockSettings } from '../settings/mockSettings';
import { installFakeApi, removeFakeApi } from '../settings/fixtures';

afterEach(() => {
  removeFakeApi();
});

function wrapper({ children }: { children: ReactNode }) {
  return createElement(I18nextProvider, { i18n: createI18n('en') }, children);
}

describe('useAppRuntime page zoom', () => {
  it('applies the stored zoom to the window once settings load, and again after a change', async () => {
    const setZoomFactor = vi.fn();
    const update = vi.fn(async (patch: Partial<typeof mockSettings>) => ({ ...mockSettings, ...patch }));
    installFakeApi({
      settings: { get: async () => ({ ...mockSettings, uiZoomPercent: 120 }), update },
      ai: { listProviders: async () => [], getProviderStatus: async () => undefined },
      app: { setZoomFactor }
    });

    const { result } = renderHook(() => useAppRuntime(mockSettings), { wrapper });
    await waitFor(() => expect(setZoomFactor).toHaveBeenLastCalledWith(1.2));

    await act(async () => {
      await result.current.updateSettings({ uiZoomPercent: 130 });
    });
    expect(setZoomFactor).toHaveBeenLastCalledWith(1.3);
    expect(update).toHaveBeenCalledWith({ uiZoomPercent: 130 });
  });

  it('ignores an older settings response that arrives while a newer change is pending', async () => {
    const pending: Array<{ patch: Partial<typeof mockSettings>; resolve: () => void }> = [];
    let stored = { ...mockSettings, uiZoomPercent: 100 };
    const update = vi.fn(
      (patch: Partial<typeof mockSettings>) =>
        new Promise<typeof mockSettings>((resolve) => {
          pending.push({
            patch,
            resolve: () => {
              stored = { ...stored, ...patch };
              resolve(stored);
            }
          });
        })
    );
    installFakeApi({
      settings: { get: async () => stored, update },
      ai: { listProviders: async () => [], getProviderStatus: async () => undefined },
      app: { setZoomFactor: vi.fn() }
    });

    const { result } = renderHook(() => useAppRuntime(mockSettings), { wrapper });
    await waitFor(() => expect(result.current.phase).toBe('ready'));

    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.updateSettings({ uiZoomPercent: 105 });
      second = result.current.updateSettings({ uiZoomPercent: 110 });
    });
    expect(result.current.settings.uiZoomPercent).toBe(110);

    // The first write answers while the second is still pending: it must not roll back to 105.
    await act(async () => {
      pending[0]!.resolve();
      await first;
    });
    expect(result.current.settings.uiZoomPercent).toBe(110);

    await act(async () => {
      pending[1]!.resolve();
      await second;
    });
    expect(result.current.settings.uiZoomPercent).toBe(110);
  });
});
