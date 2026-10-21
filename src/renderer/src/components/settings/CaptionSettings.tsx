import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { AppSettings, AiConnectorSettings } from '../../../../shared/types/settings';
import { SegmentedControl, SettingsRow, SettingsSwitch } from './SettingsPrimitives';

type CaptionSettingsProps = {
  settings: AppSettings;
  onSettingsChange?: (patch: Partial<AppSettings>) => void;
};

type PolishMode = 'none' | 'light' | 'social';

const MIN_CHARS_PER_LINE = 20;
const MAX_CHARS_PER_LINE = 60;

export function CaptionSettings({ settings, onSettingsChange }: CaptionSettingsProps): ReactElement {
  const { t } = useTranslation();
  const connector = settings.aiConnector;

  function updateConnector(patch: Partial<AiConnectorSettings>): void {
    onSettingsChange?.({ aiConnector: { ...connector, ...patch } });
  }

  // The two polish flags are one choice in the UI, so exactly one is ever set.
  const polishMode: PolishMode = connector.socialCaptionPolish ? 'social' : connector.conservativePolish ? 'light' : 'none';

  function setPolishMode(mode: PolishMode): void {
    updateConnector({
      conservativePolish: mode === 'light',
      socialCaptionPolish: mode === 'social'
    });
  }

  return (
    <>
      <SettingsRow
        label={t('settings.captions.detectLanguage')}
        htmlFor="settings-auto-detect"
        hint={t('settings.captions.detectHint')}
      >
        <SettingsSwitch
          id="settings-auto-detect"
          checked={connector.autoDetectInputLanguage}
          onChange={(autoDetectInputLanguage) => updateConnector({ autoDetectInputLanguage })}
        />
      </SettingsRow>

      <SettingsRow
        label={t('settings.captions.maxChars')}
        htmlFor="settings-max-chars"
        hint={t('settings.captions.maxCharsHint')}
      >
        <div className="settings-inline">
          <input
            id="settings-max-chars"
            className="settings-range"
            type="range"
            min={MIN_CHARS_PER_LINE}
            max={MAX_CHARS_PER_LINE}
            step={1}
            value={connector.maxCharsPerLine}
            onChange={(event) => updateConnector({ maxCharsPerLine: Number(event.currentTarget.value) })}
          />
          <output htmlFor="settings-max-chars" className="settings-range-value">
            {t('settings.captions.charactersValue', { count: connector.maxCharsPerLine })}
          </output>
        </div>
      </SettingsRow>

      <SettingsRow label={t('settings.captions.maxLines')} labelId="settings-max-lines">
        <SegmentedControl<1 | 2>
          labelledBy="settings-max-lines"
          value={connector.maxLinesPerCaption}
          options={[
            { value: 1, label: '1' },
            { value: 2, label: '2' }
          ]}
          onChange={(maxLinesPerCaption) => updateConnector({ maxLinesPerCaption })}
        />
      </SettingsRow>

      <SettingsRow label={t('settings.captions.polish')} labelId="settings-polish" hint={t(`settings.captions.polishHint.${polishMode}`)}>
        <SegmentedControl<PolishMode>
          labelledBy="settings-polish"
          value={polishMode}
          options={[
            { value: 'none', label: t('settings.captions.polishNone') },
            { value: 'light', label: t('settings.captions.polishLight') },
            { value: 'social', label: t('settings.captions.polishSocial') }
          ]}
          onChange={setPolishMode}
        />
      </SettingsRow>
    </>
  );
}
