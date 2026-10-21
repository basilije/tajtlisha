import Languages from 'lucide-react/dist/esm/icons/languages.js';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import type { UiLanguage } from '../../../shared/types/settings';

type LanguageSwitcherProps = {
  value: UiLanguage;
  onChange: (language: UiLanguage) => void;
};

const languageOptions: UiLanguage[] = ['en', 'sr-Latn', 'sr-Cyrl'];

export function LanguageSwitcher({ value, onChange }: LanguageSwitcherProps): ReactElement {
  const { t } = useTranslation();

  return (
    <label className="language-switcher">
      <span>
        <Languages aria-hidden="true" size={16} />
        {t('language.label')}
      </span>
      <select
        aria-label={t('language.label')}
        value={value === 'system' ? 'en' : value}
        onChange={(event) => onChange(event.target.value as UiLanguage)}
      >
        {languageOptions.map((language) => (
          <option key={language} value={language}>
            {t(`language.${language === 'sr-Latn' ? 'srLatn' : language === 'sr-Cyrl' ? 'srCyrl' : language}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
