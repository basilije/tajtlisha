import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StyleDrawer, type StyleDrawerProps } from '../../../src/renderer/src/components/preview';
import { DEFAULT_SUBTITLE_STYLE } from '../../../src/shared/subtitle-geometry';
import { renderWithI18n } from '../renderWithI18n';

afterEach(() => cleanup());

function renderDrawer(overrides: Partial<StyleDrawerProps> = {}) {
  const props: StyleDrawerProps = {
    style: DEFAULT_SUBTITLE_STYLE,
    onChange: vi.fn(),
    onApplyPreset: vi.fn(),
    defaultOpen: true,
    ...overrides
  };

  return { props, ...renderWithI18n(<StyleDrawer {...props} />) };
}

describe('StyleDrawer', () => {
  it('starts collapsed and expands from the header', () => {
    renderDrawer({ defaultOpen: false });

    const toggle = screen.getByRole('button', { name: 'Subtitle style' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('switch', { name: 'Bold' })).toBeNull();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('switch', { name: 'Bold' })).toBeInTheDocument();
  });

  it('applies a preset when its button is clicked and marks the active one', () => {
    const { props } = renderDrawer({ style: { ...DEFAULT_SUBTITLE_STYLE, presetId: 'clean' } });

    fireEvent.click(screen.getByRole('button', { name: /Box/ }));

    expect(props.onApplyPreset).toHaveBeenCalledWith('box');
    expect(screen.getByRole('button', { name: /Clean/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Box/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('sends a partial patch when a switch changes', () => {
    const { props } = renderDrawer({ style: { ...DEFAULT_SUBTITLE_STYLE, bold: false } });

    fireEvent.click(screen.getByRole('switch', { name: 'Bold' }));

    expect(props.onChange).toHaveBeenCalledWith({ bold: true });
  });

  it('sends a color change as a single field patch', () => {
    const { props } = renderDrawer();

    fireEvent.change(screen.getByLabelText('Text color'), { target: { value: '#ff0000' } });

    expect(props.onChange).toHaveBeenCalledWith({ textColor: '#ff0000' });
  });

  it('sends position and alignment changes from the segmented controls', () => {
    const { props } = renderDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'Middle' }));
    expect(props.onChange).toHaveBeenLastCalledWith({ position: 'middle' });

    fireEvent.click(screen.getByRole('button', { name: 'Right' }));
    expect(props.onChange).toHaveBeenLastCalledWith({ align: 'right' });
  });

  it('converts the box opacity percentage back to 0..1', () => {
    const { props } = renderDrawer({
      style: { ...DEFAULT_SUBTITLE_STYLE, backgroundEnabled: true, backgroundOpacity: 0.6 }
    });

    const opacity = screen.getByRole('spinbutton', { name: 'Box opacity (%)' });
    expect(opacity).toHaveValue(60);

    fireEvent.change(opacity, { target: { value: '80' } });

    expect(props.onChange).toHaveBeenLastCalledWith({ backgroundOpacity: 0.8 });
  });

  it('ignores out-of-range numbers instead of sending them', () => {
    const { props } = renderDrawer();

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Font size (% of the shorter side)' }), {
      target: { value: '30' }
    });

    expect(props.onChange).not.toHaveBeenCalled();
  });

  it('disables the outline controls and shows a hint while the background box is on', () => {
    renderDrawer({ style: { ...DEFAULT_SUBTITLE_STYLE, backgroundEnabled: true } });

    expect(screen.getByRole('switch', { name: 'Outline' })).toBeDisabled();
    expect(screen.getByLabelText('Outline color')).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: 'Outline width (% of font)' })).toBeDisabled();
    expect(
      screen.getByText('Outline is not used while the background box is on.')
    ).toBeInTheDocument();
  });

  it('enables the outline controls when the background box is off', () => {
    renderDrawer();

    expect(screen.getByRole('switch', { name: 'Outline' })).toBeEnabled();
    expect(screen.queryByText('Outline is not used while the background box is on.')).toBeNull();
  });
});
