import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrimBar, type TrimBarProps } from '../../../src/renderer/src/components/preview';
import { renderWithI18n } from '../renderWithI18n';

afterEach(() => cleanup());

function renderTrimBar(overrides: Partial<TrimBarProps> = {}) {
  const props: TrimBarProps = {
    durationMs: 10000,
    trim: { startMs: 1000, endMs: 5000 },
    currentTimeMs: 2500,
    captions: [
      { id: 'a', startMs: 1200, endMs: 2000 },
      { id: 'b', startMs: 3000, endMs: 4000, hasIssue: true }
    ],
    selectedCaptionId: 'a',
    onTrimChange: vi.fn(),
    onSeek: vi.fn(),
    onSelectCaption: vi.fn(),
    ...overrides
  };

  return { props, ...renderWithI18n(<TrimBar {...props} />) };
}

describe('TrimBar keyboard handles', () => {
  it('moves the start handle by 100 ms, or 1000 ms with Shift', () => {
    const { props } = renderTrimBar();
    const startHandle = screen.getByRole('slider', { name: 'Trim start' });

    fireEvent.keyDown(startHandle, { key: 'ArrowRight' });
    expect(props.onTrimChange).toHaveBeenLastCalledWith({ startMs: 1100, endMs: 5000 });

    fireEvent.keyDown(startHandle, { key: 'ArrowRight', shiftKey: true });
    expect(props.onTrimChange).toHaveBeenLastCalledWith({ startMs: 2000, endMs: 5000 });
  });

  it('moves the end handle with the arrow keys and exposes aria values', () => {
    const { props } = renderTrimBar();
    const endHandle = screen.getByRole('slider', { name: 'Trim end' });

    expect(endHandle).toHaveAttribute('aria-valuenow', '5000');
    fireEvent.keyDown(endHandle, { key: 'ArrowLeft', shiftKey: true });
    expect(props.onTrimChange).toHaveBeenLastCalledWith({ startMs: 1000, endMs: 4000 });
  });

  it('never shrinks the kept range below 100 ms', () => {
    const { props } = renderTrimBar({ trim: { startMs: 4900, endMs: 5000 } });

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Trim start' }), { key: 'ArrowRight' });
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Trim end' }), { key: 'ArrowLeft' });
    expect(props.onTrimChange).not.toHaveBeenCalled();
  });

  it('clamps a step that would cross the minimum length', () => {
    const { props } = renderTrimBar({ trim: { startMs: 1000, endMs: 1150 } });

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Trim end' }), { key: 'ArrowLeft' });
    expect(props.onTrimChange).toHaveBeenLastCalledWith({ startMs: 1000, endMs: 1100 });
  });
});

describe('TrimBar timecode fields', () => {
  it('commits a valid timecode on Enter', () => {
    const { props } = renderTrimBar();
    const end = screen.getByLabelText('End');

    fireEvent.change(end, { target: { value: '0:04.5' } });
    fireEvent.keyDown(end, { key: 'Enter' });

    expect(props.onTrimChange).toHaveBeenLastCalledWith({ startMs: 1000, endMs: 4500 });
  });

  it('reverts an unparseable value on Enter', () => {
    const { props } = renderTrimBar();
    const end = screen.getByLabelText('End') as HTMLInputElement;

    fireEvent.change(end, { target: { value: 'soon' } });
    fireEvent.keyDown(end, { key: 'Enter' });

    expect(props.onTrimChange).not.toHaveBeenCalled();
    expect(end.value).toBe('0:05.000');
  });

  it('reverts an out-of-range value on Enter', () => {
    const { props } = renderTrimBar();
    const start = screen.getByLabelText('Start') as HTMLInputElement;

    fireEvent.change(start, { target: { value: '0:06.0' } });
    fireEvent.keyDown(start, { key: 'Enter' });

    expect(props.onTrimChange).not.toHaveBeenCalled();
    expect(start.value).toBe('0:01.000');
  });

  it('reverts the draft on Escape without committing', () => {
    const { props } = renderTrimBar();
    const start = screen.getByLabelText('Start') as HTMLInputElement;

    fireEvent.change(start, { target: { value: '0:02.0' } });
    fireEvent.keyDown(start, { key: 'Escape' });
    fireEvent.blur(start);

    expect(start.value).toBe('0:01.000');
    expect(props.onTrimChange).not.toHaveBeenCalled();
  });
});

describe('TrimBar playhead actions', () => {
  it('sets the start and end at the playhead', () => {
    const { props } = renderTrimBar();

    fireEvent.click(screen.getByRole('button', { name: 'Set start at playhead' }));
    expect(props.onTrimChange).toHaveBeenLastCalledWith({ startMs: 2500, endMs: 5000 });

    fireEvent.click(screen.getByRole('button', { name: 'Set end at playhead' }));
    expect(props.onTrimChange).toHaveBeenLastCalledWith({ startMs: 1000, endMs: 2500 });
  });

  it('shows the kept duration in seconds', () => {
    renderTrimBar();

    expect(screen.getByText('Kept 4.0 s')).toBeInTheDocument();
  });
});

describe('TrimBar track', () => {
  it('seeks when the empty track is clicked', () => {
    const { props, container } = renderTrimBar();
    const track = container.querySelector<HTMLElement>('.trim-track');
    if (!track) throw new Error('track missing');
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 1000 } as DOMRect);

    fireEvent.click(track, { clientX: 250 });

    expect(props.onSeek).toHaveBeenLastCalledWith(2500);
  });

  it('selects and seeks to a caption block without also seeking the track', () => {
    const { props } = renderTrimBar();

    fireEvent.click(screen.getByRole('button', { name: 'Caption at 0:03.0' }));

    expect(props.onSelectCaption).toHaveBeenCalledWith('b');
    expect(props.onSeek).toHaveBeenCalledTimes(1);
    expect(props.onSeek).toHaveBeenCalledWith(3000);
  });
});
