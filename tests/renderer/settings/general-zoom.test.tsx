import '@testing-library/jest-dom/vitest';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GeneralSection } from '../../../src/renderer/src/components/settings/GeneralSection';
import { mockSettings } from './mockSettings';
import { renderWithI18n } from '../renderWithI18n';

describe('GeneralSection interface size', () => {
  it('lists the zoom levels and shows the stored value', () => {
    renderWithI18n(<GeneralSection settings={{ ...mockSettings, uiZoomPercent: 110 }} onLanguageChange={vi.fn()} />);

    const select = screen.getByLabelText('Interface size');
    expect(select).toHaveValue('110');
    expect(screen.getByRole('option', { name: '80%' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '150%' })).toBeInTheDocument();
    expect(screen.getByText(/Ctrl \+ to enlarge, Ctrl - to shrink, Ctrl 0 to reset/)).toBeInTheDocument();
  });

  it('saves the chosen level through onSettingsChange', () => {
    const onSettingsChange = vi.fn();
    renderWithI18n(<GeneralSection settings={mockSettings} onLanguageChange={vi.fn()} onSettingsChange={onSettingsChange} />);

    fireEvent.change(screen.getByLabelText('Interface size'), { target: { value: '125' } });
    expect(onSettingsChange).toHaveBeenCalledWith({ uiZoomPercent: 125 });
  });
});
