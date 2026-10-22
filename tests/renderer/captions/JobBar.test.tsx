import { act, fireEvent, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobBar, type JobBarJob, type JobBarResult } from '../../../src/renderer/src/components/workflow/JobBar';
import { renderWithI18n } from '../renderWithI18n';

afterEach(cleanup);

describe('JobBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function bar(job: JobBarJob | null, result: JobBarResult | null = null) {
    return renderWithI18n(
      <JobBar job={job} result={result} onCancel={vi.fn()} onDismiss={vi.fn()} />
    );
  }

  it('renders nothing when there is no job and no result', () => {
    const { container } = bar(null, null);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the stage label and a determinate progress value', () => {
    bar({ kind: 'transcribe', stage: 'transcribing', progress: 0.42, startedAt: Date.now() });

    expect(screen.getByText('Transcribing')).toBeTruthy();
    const track = screen.getByRole('progressbar', { name: 'Transcribing' });
    expect(track.getAttribute('aria-valuenow')).toBe('42');
    expect(track.className).not.toContain('is-indeterminate');
  });

  it('renders an indeterminate bar when progress is unknown', () => {
    bar({ kind: 'translate', stage: 'translating', startedAt: Date.now() });

    const track = screen.getByRole('progressbar', { name: 'Translating' });
    expect(track.getAttribute('aria-valuenow')).toBeNull();
    expect(track.className).toContain('is-indeterminate');
  });

  it('falls back to the job kind label when no stage is known yet', () => {
    bar({ kind: 'export', startedAt: Date.now() });

    expect(screen.getByText('Export')).toBeTruthy();
  });

  it('shows elapsed time that updates every second', () => {
    const startedAt = Date.now();
    bar({ kind: 'transcribe', stage: 'extracting_audio', startedAt });

    expect(screen.getByText('Elapsed 0:00')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('Elapsed 0:03')).toBeTruthy();
  });

  it('calls onCancel from the Cancel button', () => {
    const onCancel = vi.fn();
    renderWithI18n(
      <JobBar
        job={{ kind: 'transcribe', stage: 'transcribing', startedAt: Date.now() }}
        result={null}
        onCancel={onCancel}
        onDismiss={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows a successful result until dismissed', () => {
    const onDismiss = vi.fn();
    renderWithI18n(
      <JobBar
        job={null}
        result={{ kind: 'export', status: 'done', message: 'Saved 2 files to Downloads.' }}
        onCancel={vi.fn()}
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByText('Saved 2 files to Downloads.')).toBeTruthy();
    expect(screen.getByRole('status').className).toContain('job-bar-result-done');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('styles canceled and failed results differently', () => {
    const { unmount } = bar(null, { kind: 'transcribe', status: 'canceled', message: 'Canceled by you.' });
    expect(screen.getByRole('status').className).toContain('job-bar-result-canceled');
    expect(screen.getByText('Canceled')).toBeTruthy();
    unmount();

    bar(null, { kind: 'translate', status: 'error', message: 'The AI provider is not connected.' });
    expect(screen.getByRole('status').className).toContain('job-bar-result-error');
    expect(screen.getByText('Failed')).toBeTruthy();
  });

  it('shows the running job rather than the previous result', () => {
    renderWithI18n(
      <JobBar
        job={{ kind: 'preview', stage: 'rendering_video', startedAt: Date.now() }}
        result={{ kind: 'export', status: 'done', message: 'Old result' }}
        onCancel={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText('Rendering video')).toBeTruthy();
    expect(screen.queryByText('Old result')).toBeNull();
  });
});
