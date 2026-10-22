import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiProviderCapabilities, AiProviderId, AuthMode, ProviderModelDescriptor, ProviderStatus, TestConnectionResult } from '../../../shared/types/ai';
import type { TajtlishaApi } from '../../../shared/types/ipc';
import type { AppSettings, UiLanguage } from '../../../shared/types/settings';
import { normalizeUiZoom } from '../../../shared/ui-zoom';
import { resolveUiLanguage } from '../i18n';

export type AppRuntimePhase = 'loading' | 'ready' | 'error';

export type AppRuntime = {
  phase: AppRuntimePhase;
  /** Message from the failed settings load. Null unless phase is 'error'. */
  loadError: string | null;
  settings: AppSettings;
  providers: ProviderStatus[];
  /** Retries the settings and provider load after a failure. */
  reload: () => void;
  changeLanguage: (language: UiLanguage) => void;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  setActiveProvider: (providerId: AiProviderId) => void;
  connectProvider: (providerId: AiProviderId, authMode: AuthMode, secret: string) => Promise<void>;
  disconnectProvider: (providerId: AiProviderId) => Promise<void>;
  testProvider: (providerId: AiProviderId) => Promise<TestConnectionResult>;
  listModels: (providerId: AiProviderId, capability: keyof AiProviderCapabilities) => Promise<ProviderModelDescriptor[]>;
};

function getApi(): TajtlishaApi | undefined {
  return typeof window === 'undefined' ? undefined : (window.tajtlisha as TajtlishaApi | undefined);
}

/**
 * Loads settings and provider statuses from main and owns their updates.
 * Without a desktop bridge (tests, plain browser) it is ready at once with the
 * fallback settings and no providers.
 */
export function useAppRuntime(fallbackSettings: AppSettings): AppRuntime {
  const { i18n } = useTranslation();
  const [phase, setPhase] = useState<AppRuntimePhase>(() => (getApi() ? 'loading' : 'ready'));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettingsState] = useState<AppSettings>(fallbackSettings);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [attempt, setAttempt] = useState(0);
  // Latest settings for callbacks that build the next patch. Updated synchronously, before re-render.
  const settingsRef = useRef(settings);

  const setSettings = useCallback((next: AppSettings) => {
    settingsRef.current = next;
    setSettingsState(next);
  }, []);

  const applyLanguage = useCallback(
    (language: UiLanguage) => {
      const resolved = resolveUiLanguage(language);
      void i18n.changeLanguage(resolved);
      document.documentElement.lang = resolved;
    },
    [i18n]
  );

  useEffect(() => {
    const api = getApi();
    if (!api) return undefined;

    let cancelled = false;
    setPhase('loading');
    setLoadError(null);

    async function load(): Promise<void> {
      const [loadedSettings, summaries] = await Promise.all([api!.settings.get(), api!.ai.listProviders()]);
      const statuses = await Promise.all(summaries.map((provider) => api!.ai.getProviderStatus(provider.id)));
      if (cancelled) return;
      setSettings(loadedSettings);
      setProviders(statuses);
      applyLanguage(loadedSettings.uiLanguage);
      setPhase('ready');
    }

    load().catch((error: unknown) => {
      if (cancelled) return;
      setLoadError(error instanceof Error ? error.message : String(error));
      setPhase('error');
    });

    return () => {
      cancelled = true;
    };
  }, [applyLanguage, attempt, setSettings]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  // Page zoom follows the stored level. It also runs for the optimistic local update,
  // so the window zooms as soon as a shortcut or the Settings select changes it.
  const uiZoomPercent = normalizeUiZoom(settings.uiZoomPercent);
  useEffect(() => {
    getApi()?.app.setZoomFactor(uiZoomPercent / 100);
  }, [uiZoomPercent]);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      setSettings({ ...settingsRef.current, ...patch });
      const api = getApi();
      if (api) setSettings(await api.settings.update(patch));
    },
    [setSettings]
  );

  const changeLanguage = useCallback(
    (language: UiLanguage) => {
      applyLanguage(language);
      void updateSettings({ uiLanguage: language });
    },
    [applyLanguage, updateSettings]
  );

  const setActiveProvider = useCallback(
    (providerId: AiProviderId) => {
      const current = settingsRef.current;
      const next = { ...current, aiConnector: { ...current.aiConnector, activeProviderId: providerId } };
      setSettings(next);
      void getApi()?.settings.update({ aiConnector: next.aiConnector }).then(setSettings);
    },
    [setSettings]
  );

  const refreshProviders = useCallback(async () => {
    const api = getApi();
    if (!api) return;
    const summaries = await api.ai.listProviders();
    setProviders(await Promise.all(summaries.map((provider) => api.ai.getProviderStatus(provider.id))));
  }, []);

  const connectProvider = useCallback(
    async (providerId: AiProviderId, authMode: AuthMode, secret: string) => {
      const api = getApi();
      const status = await api?.ai.connectProvider({ providerId, authMode, secret });
      if (status) {
        setProviders((current) => current.map((provider) => (provider.id === providerId ? status : provider)));
      }
      const current = settingsRef.current;
      const next = {
        ...current,
        aiConnector: {
          ...current.aiConnector,
          activeProviderId: providerId,
          authModeByProvider: { ...current.aiConnector.authModeByProvider, [providerId]: authMode }
        }
      };
      setSettings(next);
      await api?.settings.update({ aiConnector: next.aiConnector }).then(setSettings);
    },
    [setSettings]
  );

  const disconnectProvider = useCallback(async (providerId: AiProviderId) => {
    const status = await getApi()?.ai.disconnectProvider(providerId);
    if (status) {
      setProviders((current) => current.map((provider) => (provider.id === providerId ? status : provider)));
    }
  }, []);

  const testProvider = useCallback(
    async (providerId: AiProviderId): Promise<TestConnectionResult> => {
      const result = await getApi()?.ai.testConnection(providerId);
      await refreshProviders();
      return (
        result ?? {
          ok: false,
          providerId,
          checkedAt: new Date().toISOString(),
          message: 'Preload API is not available.'
        }
      );
    },
    [refreshProviders]
  );

  const listModels = useCallback(
    async (providerId: AiProviderId, capability: keyof AiProviderCapabilities) =>
      (await getApi()?.ai.listModels(providerId, capability)) ?? [],
    []
  );

  return {
    phase,
    loadError,
    settings,
    providers,
    reload,
    changeLanguage,
    updateSettings,
    setActiveProvider,
    connectProvider,
    disconnectProvider,
    testProvider,
    listModels
  };
}
