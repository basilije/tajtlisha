import Settings from 'lucide-react/dist/esm/icons/settings.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import type { AiProviderId, AuthMode, ProviderStatus, TestConnectionResult } from '../../shared/types/ai';
import type { AppSettings, UiLanguage } from '../../shared/types/settings';
import { createI18n, resolveUiLanguage } from './i18n';
import { EditorPage } from './pages/EditorPage';
import { SettingsPage } from './pages/SettingsPage';

type Page = 'editor' | 'settings';

type AppShellProps = {
  initialSettings?: AppSettings;
};

const EMPTY_SETTINGS: AppSettings = {
  uiLanguage: 'system',
  autosaveEnabled: true,
  recentFilesEnabled: true,
  neverModifyOriginalVideo: true,
  exportDefaults: {
    exportOriginalSrt: true,
    exportTranslatedSrt: true,
    defaultBurnedInTrack: 'translation',
    overwritePolicy: 'ask',
    fileNamePattern: '{name}.{track}.{language}'
  },
  aiConnector: {
    authModeByProvider: {},
    transcriptionModelByProvider: {},
    textModelByProvider: {},
    autoDetectInputLanguage: true,
    conservativePolish: true,
    socialCaptionPolish: false,
    maxCharsPerLine: 42,
    maxLinesPerCaption: 2
  }
};

function AppContent({ initialSettings = EMPTY_SETTINGS }: AppShellProps): ReactElement {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState<Page>('editor');
  const [settings, setSettings] = useState<AppSettings>(initialSettings);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);

  async function refreshProviderStatuses(): Promise<void> {
    const api = window.tajtlisha;
    if (!api) {
      return;
    }

    const providerSummaries = await api.ai.listProviders();
    setProviders(await Promise.all(providerSummaries.map((provider) => api.ai.getProviderStatus(provider.id))));
  }

  useEffect(() => {
    let cancelled = false;

    async function loadRuntimeState(): Promise<void> {
      const api = window.tajtlisha;
      if (!api) {
        return;
      }

      const [loadedSettings, providerSummaries] = await Promise.all([api.settings.get(), api.ai.listProviders()]);
      if (cancelled) {
        return;
      }

      setSettings(loadedSettings);
      void i18n.changeLanguage(resolveUiLanguage(loadedSettings.uiLanguage));
      document.documentElement.lang = resolveUiLanguage(loadedSettings.uiLanguage);

      const statuses = await Promise.all(providerSummaries.map((provider) => api.ai.getProviderStatus(provider.id)));
      if (!cancelled) {
        setProviders(statuses);
      }
    }

    void loadRuntimeState().catch(() => {
      // Keep the safe empty state when the desktop bridge or persisted data is unavailable.
      // The renderer must not fall back to mock provider credentials.
      if (!cancelled) {
        setSettings(EMPTY_SETTINGS);
        setProviders([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [i18n]);

  function handleLanguageChange(language: UiLanguage): void {
    const nextSettings = { ...settings, uiLanguage: language };
    setSettings(nextSettings);
    void i18n.changeLanguage(resolveUiLanguage(language));
    document.documentElement.lang = resolveUiLanguage(language);
    void window.tajtlisha?.settings.update({ uiLanguage: language }).then(setSettings);
  }

  function handleActiveProviderChange(providerId: AiProviderId): void {
    const nextSettings = {
      ...settings,
      aiConnector: {
        ...settings.aiConnector,
        activeProviderId: providerId
      }
    };
    setSettings(nextSettings);
    void window.tajtlisha?.settings.update({ aiConnector: nextSettings.aiConnector }).then(setSettings);
  }

  function handleSettingsChange(patch: Partial<AppSettings>): void {
    const nextSettings = { ...settings, ...patch };
    setSettings(nextSettings);
    void window.tajtlisha?.settings.update(patch).then(setSettings);
  }

  async function handleConnectProvider(providerId: AiProviderId, authMode: AuthMode, secret: string): Promise<void> {
    const status = await window.tajtlisha?.ai.connectProvider({ providerId, authMode, secret });
    if (status) {
      setProviders((current) => current.map((provider) => (provider.id === providerId ? status : provider)));
    }

    const nextSettings = {
      ...settings,
      aiConnector: {
        ...settings.aiConnector,
        activeProviderId: providerId,
        authModeByProvider: {
          ...settings.aiConnector.authModeByProvider,
          [providerId]: authMode
        }
      }
    };
    setSettings(nextSettings);
    await window.tajtlisha?.settings.update({ aiConnector: nextSettings.aiConnector }).then(setSettings);
  }

  async function handleDisconnectProvider(providerId: AiProviderId): Promise<void> {
    const status = await window.tajtlisha?.ai.disconnectProvider(providerId);
    if (status) {
      setProviders((current) => current.map((provider) => (provider.id === providerId ? status : provider)));
    }
  }

  async function handleTestProvider(providerId: AiProviderId): Promise<TestConnectionResult> {
    const result = await window.tajtlisha?.ai.testConnection(providerId);
    await refreshProviderStatuses();
    return (
      result ?? {
        ok: false,
        providerId,
        checkedAt: new Date().toISOString(),
        message: 'Preload API is not available.'
      }
    );
  }

  const handleListModels = useCallback(async (
    providerId: AiProviderId,
    capability: keyof import('../../shared/types/ai').AiProviderCapabilities
  ) => {
    return (await window.tajtlisha?.ai.listModels(providerId, capability)) ?? [];
  }, []);

  return (
    <div className="app-shell">
      <header className="app-edge">
        <div className="brand">
          <div className="brand-mark">T</div>
          <div>
            <strong>{t('app.name')}</strong>
            <span>{t('app.tagline')}</span>
          </div>
        </div>
        <div className="edge-actions">
          {page === 'settings' ? (
            <button type="button" onClick={() => setPage('editor')}>
              {t('nav.editor')}
            </button>
          ) : null}
          <button
            type="button"
            className="icon-button"
            aria-label={t('nav.settings')}
            title={t('nav.settings')}
            onClick={() => setPage('settings')}
          >
            <Settings aria-hidden="true" size={17} />
          </button>
        </div>
      </header>
      <div className="content">
        {page === 'editor' ? (
          <EditorPage settings={settings} providers={providers} />
        ) : (
          <SettingsPage
            settings={settings}
            providers={providers}
            onLanguageChange={handleLanguageChange}
            onSettingsChange={handleSettingsChange}
            onActiveProviderChange={handleActiveProviderChange}
            onConnectProvider={handleConnectProvider}
            onDisconnectProvider={handleDisconnectProvider}
            onTestProvider={handleTestProvider}
            onListModels={handleListModels}
          />
        )}
      </div>
    </div>
  );
}

export function App({ initialSettings = EMPTY_SETTINGS }: AppShellProps): ReactElement {
  const i18n = useMemo(() => createI18n(initialSettings.uiLanguage), [initialSettings.uiLanguage]);

  useEffect(() => {
    document.documentElement.lang = resolveUiLanguage(initialSettings.uiLanguage);
  }, [initialSettings.uiLanguage]);

  return (
    <I18nextProvider i18n={i18n}>
      <AppContent initialSettings={initialSettings} />
    </I18nextProvider>
  );
}
