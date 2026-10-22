import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { UiLanguage } from '../../../shared/types/settings';

type LanguageSwitcherProps = {
  id?: string;
  value: UiLanguage;
  onChange: (language: UiLanguage) => void;
};

const languageOptions: UiLanguage[] = ['system', 'en', 'sr-Latn', 'sr-Cyrl'];

const languageLabelKeys: Record<UiLanguage, string> = {
  system: 'language.system',
  en: 'language.en',
  'sr-Latn': 'language.srLatn',
  'sr-Cyrl': 'language.srCyrl'
};

export function LanguageSwitcher({ id, value, onChange }: LanguageSwitcherProps): ReactElement {
  const { t } = useTranslation();

  return (
    <select
      id={id}
      className="select"
      aria-label={t('language.label')}
      value={value}
      onChange={(event) => onChange(event.target.value as UiLanguage)}
    >
      {languageOptions.map((language) => (
        <option key={language} value={language}>
          {t(languageLabelKeys[language])}
        </option>
      ))}
    </select>
  );
}
