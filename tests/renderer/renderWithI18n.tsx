import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import type { UiLanguage } from '../../src/shared/types/settings';
import { createI18n } from '../../src/renderer/src/i18n';

export function renderWithI18n(
  ui: React.ReactElement,
  language: UiLanguage = 'en',
  options?: RenderOptions
): RenderResult {
  return render(
    <I18nextProvider i18n={createI18n(language)}>
      {ui}
    </I18nextProvider>,
    options
  );
}
