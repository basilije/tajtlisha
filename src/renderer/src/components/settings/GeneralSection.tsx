import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { PROJECT_LANGUAGES } from '../../../../shared/types/project';
import type { AppSettings, UiLanguage } from '../../../../shared/types/settings';
import { normalizeUiZoom, UI_ZOOM_LEVELS } from '../../../../shared/ui-zoom';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { SettingsRow } from './SettingsPrimitives';

type GeneralSectionProps = {
  settings: AppSettings;
  onLanguageChange: (language: UiLanguage) => void;
  onSettingsChange?: (patch: Partial<AppSettings>) => void;
};

export function GeneralSection({ settings, onLanguageChange, onSettingsChange }: GeneralSectionProps): ReactElement {
  const { t } = useTranslation();
  const targetLanguage = settings.aiConnector.defaultTargetLanguage;
  const uiZoomPercent = normalizeUiZoom(settings.uiZoomPercent);

  return (
    <>
      <SettingsRow
        label={t('settings.general.uiLanguage')}
        htmlFor="settings-ui-language"
        hint={t('settings.general.uiLanguageHint')}
      >
        <LanguageSwitcher id="settings-ui-language" value={settings.uiLanguage} onChange={onLanguageChange} />
      </SettingsRow>

      <SettingsRow label={t('settings.general.uiZoom')} htmlFor="settings-ui-zoom" hint={t('settings.general.uiZoomHint')}>
        <select
          id="settings-ui-zoom"
          className="select"
          value={uiZoomPercent}
          onChange={(event) => onSettingsChange?.({ uiZoomPercent: normalizeUiZoom(Number(event.currentTarget.value)) })}
        >
          {UI_ZOOM_LEVELS.map((level) => (
            <option key={level} value={level}>
              {`${level}%`}
            </option>
          ))}
        </select>
      </SettingsRow>

      <SettingsRow
        label={t('settings.general.targetLanguage')}
        htmlFor="settings-target-language"
        hint={t('settings.general.targetLanguageHint')}
      >
        <select
          id="settings-target-language"
          className="select"
          value={targetLanguage ?? ''}
          onChange={(event) =>
            onSettingsChange?.({
              aiConnector: { ...settings.aiConnector, defaultTargetLanguage: event.currentTarget.value }
            })
          }
        >
          {targetLanguage ? null : <option value="">{t('settings.general.notSet')}</option>}
          {PROJECT_LANGUAGES.map((code) => (
            <option key={code} value={code}>
              {t(`captions.languages.${code}`)}
            </option>
          ))}
        </select>
      </SettingsRow>
    </>
  );
}
