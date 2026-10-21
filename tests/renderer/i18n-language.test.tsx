/**
 * @vitest-environment node
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UiLanguage } from '../../src/shared/types/settings';
import { LanguageSwitcher } from '../../src/renderer/src/components/LanguageSwitcher';
import { createI18n, resolveSystemLanguage, resolveUiLanguage } from '../../src/renderer/src/i18n';

describe('UI language resolution', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes explicit languages through unchanged', () => {
    expect(resolveUiLanguage('en', ['sr-RS'])).toBe('en');
    expect(resolveUiLanguage('sr-Latn', ['en-US'])).toBe('sr-Latn');
    expect(resolveUiLanguage('sr-Cyrl', ['sr-RS'])).toBe('sr-Cyrl');
  });

  it.each([
    [['sr-Latn-RS'], 'sr-Latn'],
    [['sr'], 'sr-Latn'],
    [['sr-RS'], 'sr-Latn'],
    [['sr-ME'], 'sr-Latn'],
    [['hr-HR'], 'sr-Latn'],
    [['bs'], 'sr-Latn'],
    [['sh'], 'sr-Latn'],
    [['sr-Cyrl-RS'], 'sr-Cyrl'],
    [['sr-cyrl'], 'sr-Cyrl'],
    [['en-US', 'sr-Cyrl-RS'], 'sr-Cyrl'],
    [['de-DE', 'sr-RS', 'sr-Cyrl-RS'], 'sr-Latn'],
    [['en-US', 'en'], 'en'],
    [['de-DE'], 'en'],
    [[], 'en']
  ])('resolves system languages %j to %s', (systemLanguages, expected) => {
    expect(resolveSystemLanguage(systemLanguages)).toBe(expected);
    expect(resolveUiLanguage('system', systemLanguages)).toBe(expected);
  });

  it('reads navigator.languages when no system languages are passed', () => {
    vi.stubGlobal('navigator', { languages: ['de-DE', 'sr-Cyrl-RS'] });

    expect(resolveUiLanguage('system')).toBe('sr-Cyrl');
  });

  it('falls back to English when navigator.languages has no Serbian match', () => {
    vi.stubGlobal('navigator', { languages: ['fr-FR'] });

    expect(resolveUiLanguage('system')).toBe('en');
  });
});

describe('LanguageSwitcher', () => {
  function renderSwitcher(value: UiLanguage, language: UiLanguage): string {
    return renderToStaticMarkup(
      <I18nextProvider i18n={createI18n(language)}>
        <LanguageSwitcher value={value} onChange={vi.fn()} />
      </I18nextProvider>
    );
  }

  function optionsOf(markup: string): Array<[string, string]> {
    return Array.from(markup.matchAll(/<option value="([^"]+)"[^>]*>([^<]*)<\/option>/g), ([, value, label]) => [
      value,
      label
    ]);
  }

  it('offers the system option first, followed by the fixed languages', () => {
    const markup = renderSwitcher('system', 'en');

    expect(optionsOf(markup)).toEqual([
      ['system', 'System'],
      ['en', 'English'],
      ['sr-Latn', 'Srpski latinica'],
      ['sr-Cyrl', 'Srpski cirilica']
    ]);
    expect(markup).toMatch(/<option value="system" selected="">/);
  });

  it('localizes the system option label in both Serbian scripts', () => {
    expect(optionsOf(renderSwitcher('system', 'sr-Latn'))[0]).toEqual(['system', 'Sistemski']);
    expect(optionsOf(renderSwitcher('system', 'sr-Cyrl'))[0]).toEqual(['system', 'Системски']);
  });

  it('selects the saved explicit language rather than the system option', () => {
    const markup = renderSwitcher('sr-Cyrl', 'sr-Cyrl');

    expect(markup).toMatch(/<option value="sr-Cyrl" selected="">/);
    expect(markup).not.toMatch(/<option value="system" selected="">/);
  });
});
