/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/renderer/src/App';
import { EditorPage } from '../../src/renderer/src/pages/EditorPage';
import { SettingsPage } from '../../src/renderer/src/pages/SettingsPage';
import { mockProviderStatuses, mockSettings, mockTracks } from '../../src/renderer/src/mocks/settings';
import { userFacingErrorMessage } from '../../src/renderer/src/utils/error-message';
import { renderWithI18n } from './renderWithI18n';

describe('renderer shell', () => {
  it('removes the Electron IPC wrapper from provider errors', () => {
    expect(
      userFacingErrorMessage(
        new Error("Error invoking remote method 'ai:generateSubtitles': Error: OpenAI rate limit or quota blocked this request."),
        'fallback'
      )
    ).toBe('OpenAI rate limit or quota blocked this request.');
  });

  it('switches UI language with i18next/react-i18next', async () => {
    renderWithI18n(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('Interface language'), { target: { value: 'sr-Cyrl' } });

    expect(await screen.findByRole('heading', { name: 'Подешавања' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Едитор' })).toBeInTheDocument();
  });

  it('renders subtitle tracks only when a project supplies them', () => {
    renderWithI18n(<EditorPage tracks={mockTracks} settings={mockSettings} />);

    expect(screen.getByRole('heading', { name: 'Editor' })).toBeInTheDocument();
    expect(screen.getAllByText('Original subtitles').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Translated subtitles').length).toBeGreaterThan(0);
    expect(screen.getByText('This launch build needs clear subtitles.')).toBeInTheDocument();
  });

  it('keeps export disabled until a video is ready and imports from the preview', async () => {
    const selectVideo = vi.fn().mockResolvedValue({
      inputPath: '/clips/source.mp4',
      fileUrl: 'file:///clips/source.mp4',
      durationMs: 5000,
      hasVideo: true,
      hasAudio: true
    });
    window.tajtlisha = {
      media: { selectVideo }
    } as unknown as typeof window.tajtlisha;

    renderWithI18n(<EditorPage settings={mockSettings} />);

    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /No video selected/i }));

    await waitFor(() => expect(selectVideo).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: 'Trim end' })).toHaveValue(5);
    expect(screen.getByRole('slider', { name: 'Trim start' })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByRole('slider', { name: 'Trim end' })).toHaveAttribute('aria-valuenow', '5000');
  });

  it('adjusts the trim range from timeline handles', async () => {
    const selectVideo = vi.fn().mockResolvedValue({
      inputPath: '/clips/source.mp4',
      fileUrl: 'file:///clips/source.mp4',
      durationMs: 5000,
      hasVideo: true,
      hasAudio: true
    });
    window.tajtlisha = {
      media: { selectVideo }
    } as unknown as typeof window.tajtlisha;

    renderWithI18n(<EditorPage settings={mockSettings} />);
    fireEvent.click(screen.getByRole('button', { name: /No video selected/i }));
    const trimEndHandle = await screen.findByRole('slider', { name: 'Trim end' });

    trimEndHandle.focus();
    fireEvent.keyDown(trimEndHandle, { key: 'ArrowLeft' });

    expect(screen.getByRole('spinbutton', { name: 'Trim end' })).toHaveValue(4.9);
  });

  it('keeps video playback within the trim range', async () => {
    const selectVideo = vi.fn().mockResolvedValue({
      inputPath: '/clips/source.mp4',
      fileUrl: 'file:///clips/source.mp4',
      durationMs: 5000,
      hasVideo: true,
      hasAudio: true
    });
    window.tajtlisha = {
      media: { selectVideo }
    } as unknown as typeof window.tajtlisha;

    const { container } = renderWithI18n(<EditorPage settings={mockSettings} />);
    fireEvent.click(screen.getByRole('button', { name: /No video selected/i }));
    await screen.findByRole('spinbutton', { name: 'Trim end' });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Trim start' }), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Trim end' }), { target: { value: '4' } });

    const video = container.querySelector('video');
    expect(video).not.toBeNull();
    Object.defineProperty(video, 'pause', { configurable: true, value: vi.fn() });
    video!.currentTime = 0;
    fireEvent.play(video!);
    expect(video!.currentTime).toBe(1);

    video!.currentTime = 4.1;
    fireEvent.timeUpdate(video!);
    expect(video!.pause).toHaveBeenCalledTimes(1);
    expect(video!.currentTime).toBe(4);
  });

  it('lets the user correct subtitle text and timing locally', () => {
    renderWithI18n(<EditorPage tracks={mockTracks} settings={mockSettings} />);

    const textArea = screen.getByLabelText('Original subtitles seg-1');
    fireEvent.change(textArea, { target: { value: 'Corrected subtitle text.' } });

    expect(screen.getByDisplayValue('Corrected subtitle text.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Start seg-1'), { target: { value: '1.5' } });
    fireEvent.change(screen.getByLabelText('End seg-1'), { target: { value: '3.8' } });

    expect(screen.getAllByText('0:01 - 0:03').length).toBeGreaterThan(0);
  });

  it('exports the edited tracks and trim range through the preload API', async () => {
    const selectVideo = vi.fn().mockResolvedValue({
      inputPath: '/clips/source.mp4',
      fileUrl: 'file:///clips/source.mp4',
      durationMs: 5000,
      hasVideo: true,
      hasAudio: true
    });
    const selectOutputFolder = vi.fn().mockResolvedValue({ outputFolder: '/exports' });
    const generateSubtitles = vi.fn().mockResolvedValue({ originalTrack: mockTracks[0], translatedTrack: mockTracks[1] });
    const exportProject = vi.fn().mockResolvedValue({
      originalSrtPath: '/exports/source.original.srt',
      translatedSrtPath: '/exports/source.translation.srt',
      burnedInVideoPath: '/exports/source.translation.burned.mp4'
    });
    window.tajtlisha = {
      media: { selectVideo },
      export: { selectOutputFolder, exportProject },
      ai: { generateSubtitles }
    } as unknown as typeof window.tajtlisha;

    renderWithI18n(
      <EditorPage
        settings={{ ...mockSettings, defaultOutputFolder: undefined }}
        providers={mockProviderStatuses}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /No video selected/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate subtitles' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Generate subtitles' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Export' })).toBeEnabled());

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Trim start' }), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Trim end' }), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Translated subtitles seg-1-tr'), { target: { value: 'Izmenjen prevod.' } });
    fireEvent.change(screen.getByLabelText('Font size'), { target: { value: '56' } });
    fireEvent.change(screen.getByLabelText('Text color'), { target: { value: '#ffcc00' } });
    fireEvent.change(screen.getByLabelText('Position'), { target: { value: 'top' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    await waitFor(() => expect(exportProject).toHaveBeenCalledTimes(1));
    expect(exportProject).toHaveBeenCalledWith(
      expect.objectContaining({
        inputPath: '/clips/source.mp4',
        outputFolder: '/exports',
        trim: { startMs: 1000, endMs: 4000, knownDurationMs: 5000 },
        burnedInTrack: 'translation',
        exportOriginalSrt: true,
        exportTranslatedSrt: true
      })
    );
    expect(exportProject.mock.calls[0][0].style).toEqual(expect.objectContaining({ fontSizePx: 56, textColor: '#ffcc00', position: 'top' }));
    expect(JSON.stringify(exportProject.mock.calls[0][0].tracks)).toContain('Izmenjen prevod.');
    expect(screen.getByText('Export completed: 3 files.')).toBeInTheDocument();
  });

  it('generates subtitle tracks from the active AI provider', async () => {
    const selectVideo = vi.fn().mockResolvedValue({
      inputPath: '/clips/source.mp4',
      fileUrl: 'file:///clips/source.mp4',
      durationMs: 5000,
      hasVideo: true,
      hasAudio: true
    });
    const generateSubtitles = vi.fn().mockResolvedValue({
      originalTrack: {
        id: 'original-en',
        kind: 'original',
        language: 'en',
        segments: [{ id: 'generated-1', startMs: 0, endMs: 1000, text: 'Generated original.', language: 'en' }]
      },
      translatedTrack: {
        id: 'translation-sr',
        kind: 'translation',
        language: 'sr-Latn',
        sourceLanguage: 'en',
        targetLanguage: 'sr-Latn',
        segments: [{ id: 'generated-1-tr', startMs: 0, endMs: 1000, text: 'Generisan prevod.', language: 'sr-Latn' }]
      }
    });
    window.tajtlisha = {
      media: { selectVideo },
      ai: { generateSubtitles }
    } as unknown as typeof window.tajtlisha;

    renderWithI18n(
      <EditorPage
        settings={{
          ...mockSettings,
          aiConnector: {
            ...mockSettings.aiConnector,
            activeProviderId: 'openai',
            defaultTargetLanguage: 'sr-Latn'
          }
        }}
        providers={mockProviderStatuses}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /No video selected/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate subtitles' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Generate subtitles' }));

    await waitFor(() => expect(generateSubtitles).toHaveBeenCalledTimes(1));
    expect(generateSubtitles).toHaveBeenCalledWith(
      expect.objectContaining({
        inputPath: '/clips/source.mp4',
        providerId: 'openai',
        targetLanguage: 'sr-Latn',
        autoDetectLanguage: true
      })
    );
    expect(await screen.findByDisplayValue('Generated original.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Generisan prevod.')).toBeInTheDocument();
  });

  it('keeps subtitle generation disabled until a connected provider is available', async () => {
    const selectVideo = vi.fn().mockResolvedValue({
      inputPath: '/clips/source.mp4',
      fileUrl: 'file:///clips/source.mp4',
      durationMs: 5000,
      hasVideo: true,
      hasAudio: true
    });
    window.tajtlisha = { media: { selectVideo } } as unknown as typeof window.tajtlisha;

    renderWithI18n(<EditorPage settings={mockSettings} providers={[]} />);

    fireEvent.click(screen.getByRole('button', { name: /No video selected/i }));
    await waitFor(() => expect(selectVideo).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Generate subtitles' })).toBeDisabled();
  });

  it('shows an import error when the desktop preload API is unavailable', async () => {
    window.tajtlisha = undefined as unknown as typeof window.tajtlisha;

    renderWithI18n(<EditorPage settings={mockSettings} />);

    fireEvent.click(screen.getByRole('button', { name: /No video selected/i }));

    expect(await screen.findByText('Video import failed.')).toBeInTheDocument();
  });

  it('creates a compatible preview when Chromium rejects the imported codec', async () => {
    const selectVideo = vi.fn().mockResolvedValue({
      inputPath: '/clips/source.mp4',
      fileUrl: 'tajtlisha-media://video/original',
      durationMs: 5000,
      hasVideo: true,
      hasAudio: true
    });
    const createPreviewProxy = vi.fn().mockResolvedValue({
      fileUrl: 'tajtlisha-media://video/proxy'
    });
    window.tajtlisha = {
      media: { selectVideo, createPreviewProxy }
    } as unknown as typeof window.tajtlisha;

    const { container } = renderWithI18n(<EditorPage settings={mockSettings} />);
    fireEvent.click(screen.getByRole('button', { name: /No video selected/i }));

    const video = await waitFor(() => {
      const element = container.querySelector('video');
      expect(element).not.toBeNull();
      return element as HTMLVideoElement;
    });
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 4 } });
    fireEvent.error(video);

    await waitFor(() => expect(createPreviewProxy).toHaveBeenCalledWith({ inputPath: '/clips/source.mp4' }));
    await waitFor(() => expect(container.querySelector('video')).toHaveAttribute('src', 'tajtlisha-media://video/proxy'));
  });

  it('renders all required settings sections', () => {
    renderWithI18n(
      <SettingsPage
        settings={mockSettings}
        providers={mockProviderStatuses}
        onLanguageChange={() => undefined}
      />
    );

    expect(screen.getByRole('heading', { name: 'General' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Language & localization' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI connector' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Export defaults' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Advanced/diagnostics' })).toBeInTheDocument();
  });

  it('shows the AI connector shell without raw secrets', () => {
    renderWithI18n(
      <SettingsPage
        settings={mockSettings}
        providers={mockProviderStatuses}
        onLanguageChange={() => undefined}
      />
    );

    expect(screen.getByText('OpenAI')).toBeInTheDocument();
    expect(screen.getByText('API key ending in 1234')).toBeInTheDocument();
    expect(screen.queryByText(/sk-[A-Za-z0-9]/)).not.toBeInTheDocument();
  });

  it('shows a model loading error instead of an empty unexplained picker', async () => {
    renderWithI18n(
      <SettingsPage
        settings={mockSettings}
        providers={mockProviderStatuses}
        onLanguageChange={() => undefined}
        onListModels={async () => {
          throw new Error('provider unavailable');
        }}
      />
    );

    const errorOptions = await screen.findAllByRole('option', { name: 'Models unavailable' });
    expect(errorOptions).toHaveLength(2);
  });

  it('persists editable general, AI, and export defaults through the settings callback', async () => {
    const onSettingsChange = vi.fn();
    renderWithI18n(
      <SettingsPage
        settings={mockSettings}
        onLanguageChange={() => undefined}
        onSettingsChange={onSettingsChange}
        onListModels={async (_providerId, capability) =>
          capability === 'translation' ? [{ id: 'gpt-4.1', label: 'GPT-4.1', capability }] : []
        }
      />
    );

    fireEvent.change(screen.getByLabelText('Default output folder'), { target: { value: '/exports' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({ defaultOutputFolder: '/exports' });

    fireEvent.click(screen.getByLabelText('Autosave projects'));
    expect(onSettingsChange).toHaveBeenLastCalledWith({ autosaveEnabled: false });

    fireEvent.change(screen.getByLabelText('Default target language'), { target: { value: 'de' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({
      aiConnector: expect.objectContaining({ defaultTargetLanguage: 'de' })
    });

    await screen.findByRole('option', { name: 'GPT-4.1' });
    fireEvent.change(screen.getByLabelText('Text model'), { target: { value: 'gpt-4.1' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({
      aiConnector: expect.objectContaining({ textModelByProvider: expect.objectContaining({ openai: 'gpt-4.1' }) })
    });

    fireEvent.change(screen.getByLabelText('Burned-in subtitle track'), { target: { value: 'original' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({
      exportDefaults: expect.objectContaining({ defaultBurnedInTrack: 'original' })
    });

    fireEvent.change(screen.getByLabelText('Overwrite policy'), { target: { value: 'create_copy' } });
    expect(onSettingsChange).toHaveBeenLastCalledWith({
      exportDefaults: expect.objectContaining({ overwritePolicy: 'create_copy' })
    });
  });

  it('connects an AI provider from settings without rendering the raw secret', async () => {
    const onConnectProvider = vi.fn().mockResolvedValue(undefined);
    renderWithI18n(
      <SettingsPage
        settings={mockSettings}
        providers={[{ ...mockProviderStatuses[0], connected: false, maskedCredential: undefined }]}
        onLanguageChange={() => undefined}
        onConnectProvider={onConnectProvider}
      />
    );

    fireEvent.change(screen.getByLabelText('Authentication mode'), { target: { value: 'api_key' } });
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'sk-test-secret-1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(onConnectProvider).toHaveBeenCalledWith('openai', 'api_key', 'sk-test-secret-1234'));
    expect(screen.queryByText('sk-test-secret-1234')).not.toBeInTheDocument();
    expect(screen.getByText('Provider connected.')).toBeInTheDocument();
  });
});
