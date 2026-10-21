import Bot from 'lucide-react/dist/esm/icons/bot.js';
import Cpu from 'lucide-react/dist/esm/icons/cpu.js';
import FolderOpen from 'lucide-react/dist/esm/icons/folder-open.js';
import Globe2 from 'lucide-react/dist/esm/icons/globe-2.js';
import SlidersHorizontal from 'lucide-react/dist/esm/icons/sliders-horizontal.js';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiProviderId, AiProviderCapabilities, AuthMode, ProviderModelDescriptor, ProviderStatus, TestConnectionResult } from '../../../shared/types/ai';
import type { AppSettings, UiLanguage } from '../../../shared/types/settings';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { userFacingErrorMessage } from '../utils/error-message';

type SettingsPageProps = {
  settings: AppSettings;
  providers?: ProviderStatus[];
  onLanguageChange: (language: UiLanguage) => void;
  onSettingsChange?: (patch: Partial<AppSettings>) => void;
  onActiveProviderChange?: (providerId: AiProviderId) => void;
  onConnectProvider?: (providerId: AiProviderId, authMode: AuthMode, secret: string) => Promise<void>;
  onDisconnectProvider?: (providerId: AiProviderId) => Promise<void>;
  onTestProvider?: (providerId: AiProviderId) => Promise<TestConnectionResult>;
  onListModels?: (providerId: AiProviderId, capability: keyof AiProviderCapabilities) => Promise<ProviderModelDescriptor[]>;
};

function SettingRow({ label, value }: { label: string; value: string | number }): ReactElement {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function SettingsPage({
  settings,
  providers = [],
  onLanguageChange,
  onSettingsChange,
  onActiveProviderChange,
  onConnectProvider,
  onDisconnectProvider,
  onTestProvider,
  onListModels
}: SettingsPageProps): ReactElement {
  const { t } = useTranslation();
  const activeProvider =
    providers.find((provider) => provider.id === settings.aiConnector.activeProviderId) ??
    providers[0] ??
    {
      id: settings.aiConnector.activeProviderId ?? 'openai',
      displayName: t('settings.disconnected'),
      authModes: [] as AuthMode[],
      connected: false,
      capabilities: {
        detectLanguage: false,
        transcription: false,
        segmentTimestamps: false,
        wordTimestamps: false,
        translation: false,
        subtitlePolish: false,
        textToSpeech: false
      }
    };
  const [secret, setSecret] = useState('');
  const [selectedAuthMode, setSelectedAuthMode] = useState<AuthMode | undefined>();
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [transcriptionModels, setTranscriptionModels] = useState<ProviderModelDescriptor[]>([]);
  const [textModels, setTextModels] = useState<ProviderModelDescriptor[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState(false);
  const activeAuthMode =
    selectedAuthMode ?? activeProvider.activeAuthMode ?? settings.aiConnector.authModeByProvider[activeProvider.id] ?? activeProvider.authModes[0];

  useEffect(() => {
    let cancelled = false;

    async function loadModels(): Promise<void> {
      if (!onListModels) {
        setTranscriptionModels([]);
        setTextModels([]);
        return;
      }

      setModelsLoading(true);
      setModelsError(false);
      try {
        const [nextTranscriptionModels, nextTextModels] = await Promise.all([
          onListModels(activeProvider.id, 'transcription'),
          onListModels(activeProvider.id, 'translation')
        ]);
        if (!cancelled) {
          setTranscriptionModels(nextTranscriptionModels);
          setTextModels(nextTextModels);
        }
      } catch {
        if (!cancelled) {
          setTranscriptionModels([]);
          setTextModels([]);
          setModelsError(true);
        }
      } finally {
        if (!cancelled) {
          setModelsLoading(false);
        }
      }
    }

    void loadModels();
    return () => {
      cancelled = true;
    };
  }, [activeProvider.id, onListModels]);

  function updateAiConnector(patch: Partial<AppSettings['aiConnector']>): void {
    onSettingsChange?.({
      aiConnector: {
        ...settings.aiConnector,
        ...patch
      }
    });
  }

  function updateExportDefaults(patch: Partial<AppSettings['exportDefaults']>): void {
    onSettingsChange?.({
      exportDefaults: {
        ...settings.exportDefaults,
        ...patch
      }
    });
  }

  async function handleConnect(): Promise<void> {
    if (!activeAuthMode || !onConnectProvider) {
      return;
    }

    setConnectionMessage(null);
    setConnectionBusy(true);
    try {
      await onConnectProvider(activeProvider.id, activeAuthMode, secret);
      setSecret('');
      setConnectionMessage(t('settings.connectSucceeded'));
    } catch (error) {
      setConnectionMessage(userFacingErrorMessage(error, t('settings.connectFailed')));
    } finally {
      setConnectionBusy(false);
    }
  }

  async function handleDisconnect(): Promise<void> {
    if (!onDisconnectProvider) {
      return;
    }

    setConnectionMessage(null);
    setConnectionBusy(true);
    try {
      await onDisconnectProvider(activeProvider.id);
      setConnectionMessage(t('settings.disconnectSucceeded'));
    } catch (error) {
      setConnectionMessage(userFacingErrorMessage(error, t('settings.connectFailed')));
    } finally {
      setConnectionBusy(false);
    }
  }

  async function handleTestConnection(): Promise<void> {
    if (!onTestProvider) {
      return;
    }

    setConnectionBusy(true);
    try {
      const result = await onTestProvider(activeProvider.id);
      setConnectionMessage(result.message ?? (result.ok ? t('settings.testSucceeded') : t('settings.testFailed')));
    } catch (error) {
      setConnectionMessage(userFacingErrorMessage(error, t('settings.testFailed')));
    } finally {
      setConnectionBusy(false);
    }
  }

  return (
    <main className="page settings-page" aria-labelledby="settings-title">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t('nav.settings')}</p>
          <h1 id="settings-title">{t('settings.title')}</h1>
        </div>
      </div>

      <div className="settings-grid">
        <section aria-labelledby="settings-general">
          <h2 id="settings-general">
            <FolderOpen aria-hidden="true" size={18} />
            {t('settings.general')}
          </h2>
          <label className="setting-row" htmlFor="default-output-folder">
            <span>{t('settings.defaultOutputFolder')}</span>
            <input
              id="default-output-folder"
              value={settings.defaultOutputFolder ?? ''}
              onChange={(event) => onSettingsChange?.({ defaultOutputFolder: event.currentTarget.value || undefined })}
            />
          </label>
          <label className="setting-row" htmlFor="working-folder">
            <span>{t('settings.workingFolder')}</span>
            <input
              id="working-folder"
              value={settings.workingFolder ?? ''}
              onChange={(event) => onSettingsChange?.({ workingFolder: event.currentTarget.value || undefined })}
            />
          </label>
          <label className="setting-row" htmlFor="autosave-enabled">
            <span>{t('settings.autosave')}</span>
            <input
              id="autosave-enabled"
              type="checkbox"
              checked={settings.autosaveEnabled}
              onChange={(event) => onSettingsChange?.({ autosaveEnabled: event.currentTarget.checked })}
            />
          </label>
          <label className="setting-row" htmlFor="recent-files-enabled">
            <span>{t('settings.recentFiles')}</span>
            <input
              id="recent-files-enabled"
              type="checkbox"
              checked={settings.recentFilesEnabled}
              onChange={(event) => onSettingsChange?.({ recentFilesEnabled: event.currentTarget.checked })}
            />
          </label>
          <SettingRow label={t('settings.neverModifyOriginal')} value={t('settings.enabled')} />
        </section>

        <section aria-labelledby="settings-localization">
          <h2 id="settings-localization">
            <Globe2 aria-hidden="true" size={18} />
            {t('settings.localization')}
          </h2>
          <LanguageSwitcher value={settings.uiLanguage} onChange={onLanguageChange} />
          <label className="setting-row" htmlFor="default-target-language">
            <span>{t('settings.targetLanguage')}</span>
            <input
              id="default-target-language"
              value={settings.aiConnector.defaultTargetLanguage ?? ''}
              onChange={(event) => updateAiConnector({ defaultTargetLanguage: event.currentTarget.value || undefined })}
            />
          </label>
          <label className="setting-row" htmlFor="auto-detect-language">
            <span>{t('settings.detectLanguage')}</span>
            <input
              id="auto-detect-language"
              type="checkbox"
              checked={settings.aiConnector.autoDetectInputLanguage}
              onChange={(event) => updateAiConnector({ autoDetectInputLanguage: event.currentTarget.checked })}
            />
          </label>
        </section>

        <section aria-labelledby="settings-ai">
          <h2 id="settings-ai">
            <Bot aria-hidden="true" size={18} />
            {t('settings.aiConnector')}
          </h2>
          <label className="setting-row" htmlFor="active-provider">
            <span>{t('settings.activeProvider')}</span>
            <select
              id="active-provider"
              value={activeProvider.id}
              onChange={(event) => onActiveProviderChange?.(event.currentTarget.value as AiProviderId)}
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="setting-row" htmlFor="auth-mode">
            <span>{t('settings.authMode')}</span>
            <select id="auth-mode" value={activeAuthMode} onChange={(event) => setSelectedAuthMode(event.currentTarget.value as AuthMode)}>
              {activeProvider.authModes.map((authMode) => (
                <option key={authMode} value={authMode}>
                  {authMode}
                </option>
              ))}
            </select>
          </label>
          <SettingRow
            label={t('settings.connectionState')}
            value={activeProvider.connected ? t('settings.credentialStored') : t('settings.disconnected')}
          />
          <SettingRow
            label={t('settings.credential')}
            value={activeProvider.maskedCredential ?? t('settings.noCredential')}
          />
          <label className="setting-row" htmlFor="transcription-model">
            <span>{t('settings.transcriptionModel')}</span>
            <select
              id="transcription-model"
              value={settings.aiConnector.transcriptionModelByProvider[activeProvider.id] ?? ''}
              onChange={(event) =>
                updateAiConnector({
                  transcriptionModelByProvider: {
                    ...settings.aiConnector.transcriptionModelByProvider,
                    [activeProvider.id]: event.currentTarget.value
                  }
                })
              }
            >
              <option value="">{t('settings.modelDefault')}</option>
              {modelsLoading ? <option value="" disabled>{t('settings.modelsLoading')}</option> : null}
              {modelsError ? <option value="" disabled>{t('settings.modelsError')}</option> : null}
              {modelOptions(transcriptionModels, settings.aiConnector.transcriptionModelByProvider[activeProvider.id]).map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
          <label className="setting-row" htmlFor="text-model">
            <span>{t('settings.textModel')}</span>
            <select
              id="text-model"
              value={settings.aiConnector.textModelByProvider[activeProvider.id] ?? ''}
              onChange={(event) =>
                updateAiConnector({
                  textModelByProvider: {
                    ...settings.aiConnector.textModelByProvider,
                    [activeProvider.id]: event.currentTarget.value
                  }
                })
              }
            >
              <option value="">{t('settings.modelDefault')}</option>
              {modelsLoading ? <option value="" disabled>{t('settings.modelsLoading')}</option> : null}
              {modelsError ? <option value="" disabled>{t('settings.modelsError')}</option> : null}
              {modelOptions(textModels, settings.aiConnector.textModelByProvider[activeProvider.id]).map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
          <div className="connector-actions">
            <label>
              <span>{t('settings.apiKey')}</span>
              <input
                aria-label={t('settings.apiKey')}
                autoComplete="off"
                placeholder={activeProvider.connected ? t('settings.replaceCredential') : t('settings.apiKey')}
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.currentTarget.value)}
              />
            </label>
            <div>
              <button type="button" disabled={!secret.trim() || !onConnectProvider || connectionBusy} onClick={handleConnect}>
                {activeProvider.connected ? t('settings.replace') : t('settings.connect')}
              </button>
              <button type="button" disabled={!activeProvider.connected || !onTestProvider || connectionBusy} onClick={handleTestConnection}>
                {t('settings.testConnection')}
              </button>
              <button type="button" disabled={!activeProvider.connected || !onDisconnectProvider || connectionBusy} onClick={handleDisconnect}>
                {t('settings.disconnect')}
              </button>
            </div>
            {connectionMessage ? <p className="inline-status" aria-live="polite">{connectionMessage}</p> : null}
          </div>
        </section>

        <section aria-labelledby="settings-export">
          <h2 id="settings-export">
            <SlidersHorizontal aria-hidden="true" size={18} />
            {t('settings.exportDefaults')}
          </h2>
          <label className="setting-row" htmlFor="export-original-srt">
            <span>{t('settings.exportOriginal')}</span>
            <input
              id="export-original-srt"
              type="checkbox"
              checked={settings.exportDefaults.exportOriginalSrt}
              onChange={(event) => updateExportDefaults({ exportOriginalSrt: event.currentTarget.checked })}
            />
          </label>
          <label className="setting-row" htmlFor="export-translated-srt">
            <span>{t('settings.exportTranslated')}</span>
            <input
              id="export-translated-srt"
              type="checkbox"
              checked={settings.exportDefaults.exportTranslatedSrt}
              onChange={(event) => updateExportDefaults({ exportTranslatedSrt: event.currentTarget.checked })}
            />
          </label>
          <label className="setting-row" htmlFor="burned-in-track">
            <span>{t('settings.burnedInTrack')}</span>
            <select
              id="burned-in-track"
              value={settings.exportDefaults.defaultBurnedInTrack}
              onChange={(event) => updateExportDefaults({ defaultBurnedInTrack: event.currentTarget.value as 'original' | 'translation' })}
            >
              <option value="original">{t('settings.originalTrack')}</option>
              <option value="translation">{t('settings.translationTrack')}</option>
            </select>
          </label>
          <label className="setting-row" htmlFor="overwrite-policy">
            <span>{t('settings.overwritePolicy')}</span>
            <select
              id="overwrite-policy"
              value={settings.exportDefaults.overwritePolicy}
              onChange={(event) =>
                updateExportDefaults({ overwritePolicy: event.currentTarget.value as AppSettings['exportDefaults']['overwritePolicy'] })
              }
            >
              <option value="ask">{t('settings.overwriteAsk')}</option>
              <option value="overwrite">{t('settings.overwriteExisting')}</option>
              <option value="create_copy">{t('settings.createCopy')}</option>
            </select>
          </label>
          <label className="setting-row" htmlFor="file-name-pattern">
            <span>{t('settings.fileNamePattern')}</span>
            <input
              id="file-name-pattern"
              value={settings.exportDefaults.fileNamePattern}
              onChange={(event) => updateExportDefaults({ fileNamePattern: event.currentTarget.value })}
            />
          </label>
        </section>

        <section aria-labelledby="settings-advanced">
          <h2 id="settings-advanced">
            <Cpu aria-hidden="true" size={18} />
            {t('settings.advanced')}
          </h2>
          <SettingRow label={t('settings.ffmpeg')} value={t('settings.ffmpegNotChecked')} />
          <SettingRow label={t('settings.diagnostics')} value={t('settings.diagnosticsValue')} />
        </section>
      </div>
    </main>
  );
}

function modelOptions(models: ProviderModelDescriptor[], selectedModelId: string | undefined): ProviderModelDescriptor[] {
  if (!selectedModelId || models.some((model) => model.id === selectedModelId)) {
    return models;
  }

  return [{ id: selectedModelId, label: selectedModelId, capability: 'translation' }, ...models];
}
