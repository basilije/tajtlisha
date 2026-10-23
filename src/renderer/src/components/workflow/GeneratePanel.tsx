import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right.js';
import CircleCheck from 'lucide-react/dist/esm/icons/circle-check.js';
import AudioLines from 'lucide-react/dist/esm/icons/audio-lines.js';
import FileUp from 'lucide-react/dist/esm/icons/file-up.js';
import Sparkles from 'lucide-react/dist/esm/icons/sparkles.js';
import TriangleAlert from 'lucide-react/dist/esm/icons/triangle-alert.js';
import { PROJECT_LANGUAGES } from '../../../../shared/types/project';import './workflow.css';


export type GenerateProviderInfo = {
  id: string;
  displayName: string;
  connected: boolean;
  canTranscribe: boolean;
  canTranslate: boolean;
};

export type GeneratePanelProps = {
  hasSource: boolean;
  hasAudio: boolean;
  provider: GenerateProviderInfo | null;
  sourceLanguage: string | 'auto';
  targetLanguage: string;
  captionCount: number;
  rowsNeedingTranslation: number;
  timingSource?: 'word' | 'segment' | 'speech_detection';
  busy: boolean;
  onSourceLanguageChange(code: string | 'auto'): void;
  onTargetLanguageChange(code: string): void;
  onTranscribe(): void;
  onImportSrt(): void;
  onTranslate(): void;
  onOpenSettings(): void;
};

type Reason = { key: string; values?: Record<string, string> };

/** First reason that blocks an action, or null when it can run. */
function transcribeBlock(props: GeneratePanelProps): Reason | null {
  if (props.busy) return { key: 'captions.generate.reason.busy' };
  if (!props.hasSource) return { key: 'captions.generate.reason.noVideo' };
  if (!props.hasAudio) return { key: 'captions.generate.reason.noAudio' };
  if (!props.provider) return { key: 'captions.generate.reason.noProvider' };
  if (!props.provider.connected) {
    return { key: 'captions.generate.reason.notConnected', values: { provider: props.provider.displayName } };
  }
  if (!props.provider.canTranscribe) {
    return { key: 'captions.generate.reason.cannotTranscribe', values: { provider: props.provider.displayName } };
  }
  return null;
}

function importBlock(props: GeneratePanelProps): Reason | null {
  if (props.busy) return { key: 'captions.generate.reason.busy' };
  if (!props.hasSource) return { key: 'captions.generate.reason.noVideo' };
  return null;
}

function translateBlock(props: GeneratePanelProps): Reason | null {
  if (props.busy) return { key: 'captions.generate.reason.busy' };
  if (props.captionCount === 0) return { key: 'captions.generate.reason.noCaptions' };
  if (props.rowsNeedingTranslation === 0) return { key: 'captions.generate.reason.allTranslated' };
  if (!props.provider) return { key: 'captions.generate.reason.noProvider' };
  if (!props.provider.connected) {
    return { key: 'captions.generate.reason.notConnected', values: { provider: props.provider.displayName } };
  }
  if (!props.provider.canTranslate) {
    return { key: 'captions.generate.reason.cannotTranslate', values: { provider: props.provider.displayName } };
  }
  return null;
}

/**
 * Compact toolbar for the AI steps. Every disabled action names the reason
 * next to it, so the user never has to guess why a button does nothing.
 */
export function GeneratePanel(props: GeneratePanelProps): ReactElement {
  const { t } = useTranslation();
  const {
    provider,
    sourceLanguage,
    targetLanguage,
    captionCount,
    rowsNeedingTranslation,
    timingSource,
    onSourceLanguageChange,
    onTargetLanguageChange,
    onTranscribe,
    onImportSrt,
    onTranslate,
    onOpenSettings
  } = props;

  const transcribeReason = transcribeBlock(props);
  const importReason = importBlock(props);
  const translateReason = translateBlock(props);
  const translateLabel =
    rowsNeedingTranslation > 0
      ? t('captions.generate.translateCount', { count: rowsNeedingTranslation })
      : captionCount > 0
        ? t('captions.generate.translateAgain')
        : t('captions.generate.translate');

  return (
    <div className="generate-panel" role="toolbar" aria-label={t('captions.generate.toolbar')}>
      <div className="generate-languages">
        <div className="field generate-field">
          <span className="field-label" id="generate-source-language">
            {t('captions.generate.sourceLanguage')}
          </span>
          <select
            className="select"
            aria-labelledby="generate-source-language"
            value={sourceLanguage}
            onChange={(event) => onSourceLanguageChange(event.target.value)}
          >
            <option value="auto">{t('captions.languages.auto')}</option>
            {PROJECT_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {t(`captions.languages.${code}`)}
              </option>
            ))}
          </select>
        </div>
        <ArrowRight aria-hidden="true" className="generate-arrow" size={16} />
        <div className="field generate-field">
          <span className="field-label" id="generate-target-language">
            {t('captions.generate.targetLanguage')}
          </span>
          <select
            className="select"
            aria-labelledby="generate-target-language"
            value={targetLanguage}
            onChange={(event) => onTargetLanguageChange(event.target.value)}
          >
            {PROJECT_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {t(`captions.languages.${code}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="generate-provider">
        <span className="field-label">{t('captions.generate.provider')}</span>
        {provider ? (
          <span className="generate-provider-name">
            {provider.displayName}
            {provider.connected ? (
              <span className="badge badge-success">
                <CircleCheck aria-hidden="true" size={12} />
                {t('captions.generate.providerConnected')}
              </span>
            ) : (
              <span className="badge badge-muted">{t('captions.generate.providerNotConnected')}</span>
            )}
          </span>
        ) : (
          <span className="muted">{t('captions.generate.noProvider')}</span>
        )}
        {(!provider || !provider.connected) && (
          <button type="button" className="btn btn-sm" onClick={onOpenSettings}>
            {t('captions.generate.openSettings')}
          </button>
        )}
      </div>

      <div className="generate-actions">
        <span className="muted">{t('captions.count', { count: captionCount })}</span>
        {timingSource === 'speech_detection' && (
          <span
            className="badge badge-warning"
            title={t('captions.generate.timingApproximateHint')}
          >
            <TriangleAlert aria-hidden="true" size={12} />
            {t('captions.generate.timingApproximate')}
          </span>
        )}
        <div className="generate-action">
          <button
            type="button"
            className="btn btn-primary"
            disabled={transcribeReason !== null}
            onClick={onTranscribe}
          >
            <AudioLines aria-hidden="true" size={14} />
            {captionCount > 0
              ? t('captions.generate.transcribeAgain')
              : t('captions.generate.transcribe')}
          </button>
          {transcribeReason && (
            <span className="generate-reason">{t(transcribeReason.key, transcribeReason.values)}</span>
          )}
        </div>
        <div className="generate-action">
          <button type="button" className="btn" disabled={importReason !== null} onClick={onImportSrt}>
            <FileUp aria-hidden="true" size={14} />
            {captionCount > 0 ? t('captions.generate.importSrtAgain') : t('captions.generate.importSrt')}
          </button>
          {importReason && <span className="generate-reason">{t(importReason.key, importReason.values)}</span>}
        </div>
        <div className="generate-action">
          <button
            type="button"
            className="btn"
            disabled={translateReason !== null}
            onClick={onTranslate}
          >
            <Sparkles aria-hidden="true" size={14} />
            {translateLabel}
          </button>
          {translateReason && (
            <span className="generate-reason">{t(translateReason.key, translateReason.values)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
