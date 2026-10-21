import Download from 'lucide-react/dist/esm/icons/download.js';
import Film from 'lucide-react/dist/esm/icons/film.js';
import Scissors from 'lucide-react/dist/esm/icons/scissors.js';
import Upload from 'lucide-react/dist/esm/icons/upload.js';
import * as Slider from '@radix-ui/react-slider';
import type { CSSProperties, ChangeEvent, ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SelectVideoResult } from '../../../shared/types/media';
import type { ProviderStatus } from '../../../shared/types/ai';
import type { AppSettings } from '../../../shared/types/settings';
import type { SubtitleStyle } from '../../../shared/types/style';
import type { SubtitleTrack } from '../../../shared/types/subtitles';
import { userFacingErrorMessage } from '../utils/error-message';

type EditorPageProps = {
  tracks?: SubtitleTrack[];
  settings: AppSettings;
  providers?: ProviderStatus[];
};

const EMPTY_TRACKS: SubtitleTrack[] = [];

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function EditorPage({ tracks = EMPTY_TRACKS, settings, providers = [] }: EditorPageProps): ReactElement {
  const { t } = useTranslation();
  const [selectedVideo, setSelectedVideo] = useState<SelectVideoResult>(null);
  const [editableTracks, setEditableTracks] = useState<SubtitleTrack[]>(tracks);
  const [trimStartMs, setTrimStartMs] = useState(0);
  const [trimEndMs, setTrimEndMs] = useState(0);
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyle>(defaultSubtitleStyle);
  const [importError, setImportError] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [previewFallbackAttempted, setPreviewFallbackAttempted] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const originalTrack = editableTracks.find((track) => track.kind === 'original');
  const translationTrack = editableTracks.find((track) => track.kind === 'translation');
  const totalSegments = editableTracks.reduce((count, track) => count + track.segments.length, 0);
  const hasTimingIssues = editableTracks.some((track) => hasInvalidTiming(track));
  const isExportReady = Boolean(selectedVideo?.hasVideo) && totalSegments > 0 && !hasTimingIssues;
  const activeProvider = providers.find((provider) => provider.id === settings.aiConnector.activeProviderId);
  const canGenerateSubtitles = Boolean(selectedVideo?.hasAudio) && Boolean(activeProvider?.connected && activeProvider.capabilities.transcription && activeProvider.capabilities.translation);
  const durationMs = selectedVideo?.durationMs ?? 0;
  const effectiveTrimEndMs = trimEndMs || durationMs;
  const previewTrack = translationTrack ?? originalTrack;
  const timelineDurationMs =
    durationMs || Math.max(1, ...editableTracks.flatMap((track) => track.segments.map((segment) => segment.endMs)));
  const activePreviewSegment = previewTrack?.segments.find(
    (segment) => currentTimeMs >= segment.startMs && currentTimeMs < segment.endMs
  );

  useEffect(() => {
    setEditableTracks(tracks);
  }, [tracks]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !selectedVideo) {
      return;
    }

    const currentMs = Math.round(video.currentTime * 1000);
    if (currentMs < trimStartMs || currentMs > effectiveTrimEndMs) {
      video.currentTime = trimStartMs / 1000;
      setCurrentTimeMs(trimStartMs);
    }
  }, [effectiveTrimEndMs, selectedVideo, trimStartMs]);

  async function handleImportVideo(): Promise<void> {
    setImportError(null);
    setVideoError(null);
    setPreviewFallbackAttempted(false);

    try {
      const video = await window.tajtlisha?.media?.selectVideo?.();
      if (video) {
        setSelectedVideo(video);
        setEditableTracks([]);
        setCurrentTimeMs(0);
        setTrimStartMs(0);
        setTrimEndMs(video.durationMs ?? 0);
        return;
      }
      setImportError(t('editor.importFailed'));
    } catch (error) {
      setImportError(userFacingErrorMessage(error, t('editor.importFailed')));
    }
  }

  function handleTrimChange(field: 'start' | 'end', value: string): void {
    const nextMs = secondsInputToMs(value);
    if (field === 'start') {
      setTrimStartMs(Math.max(0, Math.min(nextMs, effectiveTrimEndMs)));
      return;
    }

    setTrimEndMs(Math.max(trimStartMs, durationMs ? Math.min(nextMs, durationMs) : nextMs));
  }

  function handleTimelineTrimChange(values: number[]): void {
    const [startMs, endMs] = values;
    if (startMs === undefined || endMs === undefined) {
      return;
    }

    setTrimStartMs(startMs);
    setTrimEndMs(endMs);
  }

  async function handleVideoPlaybackError(code: number | string): Promise<void> {
    if (
      code === 4 &&
      selectedVideo &&
      !previewFallbackAttempted &&
      window.tajtlisha?.media?.createPreviewProxy
    ) {
      setPreviewFallbackAttempted(true);
      setVideoError(t('editor.preparingPreview'));
      try {
        const preview = await window.tajtlisha.media.createPreviewProxy({ inputPath: selectedVideo.inputPath });
        setSelectedVideo((current) => (current ? { ...current, fileUrl: preview.fileUrl } : current));
        setVideoError(null);
        return;
      } catch {
        setVideoError(t('editor.previewConversionFailed'));
        return;
      }
    }

    setVideoError(t('editor.videoPlaybackFailed', { code }));
  }

  function handleSegmentChange(
    trackId: string,
    segmentId: string,
    field: 'startMs' | 'endMs' | 'text',
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ): void {
    const value = field === 'text' ? event.currentTarget.value : secondsInputToMs(event.currentTarget.value);
    setEditableTracks((currentTracks) =>
      currentTracks.map((track) =>
        track.id === trackId
          ? {
              ...track,
              segments: track.segments.map((segment) =>
                segment.id === segmentId
                  ? {
                      ...segment,
                      [field]: value
                    }
                  : segment
              )
            }
          : track
      )
    );
  }

  function updateSubtitleStyle<Key extends keyof SubtitleStyle>(key: Key, value: SubtitleStyle[Key]): void {
    setSubtitleStyle((current) => ({
      ...current,
      [key]: value
    }));
  }

  function seekPreview(timeMs: number): void {
    const nextTimeMs = Math.max(trimStartMs, Math.min(timeMs, effectiveTrimEndMs || timelineDurationMs));
    setCurrentTimeMs(nextTimeMs);
    if (videoRef.current) {
      videoRef.current.currentTime = nextTimeMs / 1000;
    }
  }

  function constrainPlaybackToTrim(video: HTMLVideoElement, pauseAtEnd = false): void {
    const currentMs = Math.round(video.currentTime * 1000);
    if (currentMs < trimStartMs) {
      video.currentTime = trimStartMs / 1000;
      setCurrentTimeMs(trimStartMs);
      return;
    }

    if (currentMs >= effectiveTrimEndMs) {
      if (pauseAtEnd) {
        video.pause();
      }
      video.currentTime = effectiveTrimEndMs / 1000;
      setCurrentTimeMs(effectiveTrimEndMs);
      return;
    }

    setCurrentTimeMs(currentMs);
  }

  function handleVideoPlay(): void {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (Math.round(video.currentTime * 1000) >= effectiveTrimEndMs) {
      video.currentTime = trimStartMs / 1000;
      setCurrentTimeMs(trimStartMs);
    }
    constrainPlaybackToTrim(video);
  }

  async function handleExport(): Promise<void> {
    if (!selectedVideo || !window.tajtlisha?.export) {
      return;
    }

    setExportStatus(null);
    setIsExporting(true);
    try {
      const outputFolder = settings.defaultOutputFolder ?? (await window.tajtlisha.export.selectOutputFolder())?.outputFolder;
      if (!outputFolder) {
        return;
      }

      const result = await window.tajtlisha.export.exportProject({
        inputPath: selectedVideo.inputPath,
        outputFolder,
        tracks: editableTracks,
        style: subtitleStyle,
        trim:
          effectiveTrimEndMs > trimStartMs
            ? {
                startMs: trimStartMs,
                endMs: effectiveTrimEndMs,
                knownDurationMs: durationMs || undefined
              }
            : undefined,
        exportOriginalSrt: settings.exportDefaults.exportOriginalSrt,
        exportTranslatedSrt: settings.exportDefaults.exportTranslatedSrt,
        burnedInTrack: settings.exportDefaults.defaultBurnedInTrack,
        fileNamePattern: settings.exportDefaults.fileNamePattern,
        overwritePolicy: settings.exportDefaults.overwritePolicy
      });

      const exportedPaths = [result.originalSrtPath, result.translatedSrtPath, result.burnedInVideoPath].filter(Boolean).length;
      setExportStatus(t('editor.exportSucceeded', { count: exportedPaths }));
    } catch (error) {
      setExportStatus(userFacingErrorMessage(error, t('editor.exportFailed')));
    } finally {
      setIsExporting(false);
    }
  }

  async function handleGenerateSubtitles(): Promise<void> {
    if (!selectedVideo || !settings.aiConnector.activeProviderId || !window.tajtlisha?.ai) {
      return;
    }

    setAiStatus(null);
    setIsGenerating(true);
    try {
      const result = await window.tajtlisha.ai.generateSubtitles({
        inputPath: selectedVideo.inputPath,
        knownDurationMs: durationMs || undefined,
        trim:
          effectiveTrimEndMs > trimStartMs
            ? {
                startMs: trimStartMs,
                endMs: effectiveTrimEndMs,
                knownDurationMs: durationMs || undefined
              }
            : undefined,
        providerId: settings.aiConnector.activeProviderId,
        transcriptionModelId: settings.aiConnector.transcriptionModelByProvider[settings.aiConnector.activeProviderId],
        textModelId: settings.aiConnector.textModelByProvider[settings.aiConnector.activeProviderId],
        autoDetectLanguage: settings.aiConnector.autoDetectInputLanguage,
        targetLanguage: settings.aiConnector.defaultTargetLanguage ?? 'sr-Latn',
        polish: settings.aiConnector.conservativePolish || settings.aiConnector.socialCaptionPolish,
        polishMode: settings.aiConnector.socialCaptionPolish ? 'social_caption' : 'conservative',
        maxCharsPerLine: settings.aiConnector.maxCharsPerLine,
        maxLinesPerCaption: settings.aiConnector.maxLinesPerCaption
      });

      setEditableTracks([result.originalTrack, result.translatedTrack]);
      setAiStatus(t('editor.aiSucceeded', { count: result.originalTrack.segments.length + result.translatedTrack.segments.length }));
    } catch (error) {
      setAiStatus(userFacingErrorMessage(error, t('editor.aiFailed')));
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main className="page editor-page" aria-labelledby="editor-title">
      <div className="page-header editor-toolbar">
        <div>
          <p className="eyebrow">{t('nav.editor')}</p>
          <h1 id="editor-title">{t('editor.title')}</h1>
        </div>
        <div className="actions">
          <button type="button" onClick={handleImportVideo}>
            <Upload aria-hidden="true" size={16} />
            {t('editor.import')}
          </button>
          <button type="button" disabled={!canGenerateSubtitles || isGenerating} onClick={handleGenerateSubtitles}>
            {isGenerating ? t('editor.generating') : t('editor.generateSubtitles')}
          </button>
          <button type="button" className="primary" disabled={!isExportReady || isExporting} onClick={handleExport}>
            <Download aria-hidden="true" size={16} />
            {isExporting ? t('editor.exporting') : t('editor.export')}
          </button>
        </div>
      </div>

      <section className="editor-grid editor-workspace">
        <div className="video-panel" aria-label={t('editor.preview')}>
          <div className="video-canvas">
            {selectedVideo ? (
              <div className="video-preview-shell">
                <video
                  ref={videoRef}
                  className="video-preview"
                  src={selectedVideo.fileUrl}
                  controls
                  preload="metadata"
                  onCanPlay={() => setVideoError(null)}
                  onError={(event) => void handleVideoPlaybackError(event.currentTarget.error?.code ?? 'unknown')}
                  onPlay={handleVideoPlay}
                  onSeeking={(event) => constrainPlaybackToTrim(event.currentTarget, true)}
                  onTimeUpdate={(event) => constrainPlaybackToTrim(event.currentTarget, true)}
                  onSeeked={(event) => constrainPlaybackToTrim(event.currentTarget, true)}
                />
                {activePreviewSegment ? (
                  <div className={`subtitle-preview subtitle-preview-${subtitleStyle.position}`} style={subtitlePreviewStyle(subtitleStyle)}>
                    {activePreviewSegment.text}
                  </div>
                ) : null}
              </div>
            ) : (
              <button type="button" className="mock-video" onClick={handleImportVideo}>
                <Film aria-hidden="true" size={48} />
                <strong>{t('editor.noVideo')}</strong>
                <span>{t('editor.emptyState')}</span>
              </button>
            )}
          </div>
          <div className="preview-statusbar">
            <span>{t('editor.preview')}</span>
            <time>{formatTime(currentTimeMs)} / {formatTime(durationMs)}</time>
          </div>
          <div className="editor-messages">
            {importError ? <p className="inline-error" role="alert">{importError}</p> : null}
            {videoError ? <p className="inline-error" role="alert">{videoError}</p> : null}
            {aiStatus ? <p className="inline-status" aria-live="polite">{aiStatus}</p> : null}
            {exportStatus ? <p className="inline-status" aria-live="polite">{exportStatus}</p> : null}
          </div>
        </div>

        <aside className="inspector" aria-label={t('editor.source')}>
          <h2>{t('editor.source')}</h2>
          <dl>
            <div>
              <dt>{t('editor.trim')}</dt>
              <dd className="trim-controls">
                <Scissors aria-hidden="true" size={14} />
                <label>
                  <span>{t('editor.trimStart')}</span>
                  <input
                    aria-label={t('editor.trimStart')}
                    min={0}
                    max={durationMs ? msToSecondsInput(effectiveTrimEndMs) : undefined}
                    step="0.1"
                    type="number"
                    value={msToSecondsInput(trimStartMs)}
                    onChange={(event) => handleTrimChange('start', event.currentTarget.value)}
                  />
                </label>
                <label>
                  <span>{t('editor.trimEnd')}</span>
                  <input
                    aria-label={t('editor.trimEnd')}
                    min={msToSecondsInput(trimStartMs)}
                    max={durationMs ? msToSecondsInput(durationMs) : undefined}
                    step="0.1"
                    type="number"
                    value={msToSecondsInput(effectiveTrimEndMs)}
                    onChange={(event) => handleTrimChange('end', event.currentTarget.value)}
                  />
                </label>
              </dd>
            </div>
            <div>
              <dt>{t('editor.file')}</dt>
              <dd>{selectedVideo?.inputPath ?? t('editor.noVideo')}</dd>
            </div>
            <div>
              <dt>{t('editor.stylePreset')}</dt>
              <dd>{subtitleStyle.fontFamily} / {subtitleStyle.fontSizePx}px</dd>
            </div>
            <div>
              <dt>{t('editor.segmentCount', { count: totalSegments })}</dt>
              <dd>{totalSegments}</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className="editor-bottom-workspace" aria-label={t('editor.timeline')}>
        <div className="timeline">
          <div className="timeline-heading">
            <strong>{t('editor.timeline')}</strong>
            <time>{formatTime(currentTimeMs)} / {formatTime(timelineDurationMs)}</time>
          </div>
          <div className="timeline-ruler" aria-hidden="true">
            <span>0:00</span>
            <span>{formatTime(timelineDurationMs / 2)}</span>
            <span>{formatTime(timelineDurationMs)}</span>
          </div>
          <Slider.Root
            className="timeline-trim-slider"
            aria-label={t('editor.trim')}
            disabled={!durationMs}
            max={durationMs || 100}
            min={0}
            minStepsBetweenThumbs={1}
            step={100}
            value={[trimStartMs, effectiveTrimEndMs]}
            onValueChange={handleTimelineTrimChange}
          >
            <Slider.Track className="timeline-trim-track">
              <Slider.Range className="timeline-trim-range" />
            </Slider.Track>
            <Slider.Thumb aria-label={t('editor.trimStart')} className="timeline-trim-thumb" />
            <Slider.Thumb aria-label={t('editor.trimEnd')} className="timeline-trim-thumb" />
            <span
              className="timeline-playhead"
              style={{ left: `${Math.min(100, (currentTimeMs / timelineDurationMs) * 100)}%` }}
            />
          </Slider.Root>
          <div className="timeline-lanes">
            {[originalTrack, translationTrack].map((track) =>
              track ? (
                <div className={`timeline-lane timeline-lane-${track.kind}`} key={track.id}>
                  <strong>{track.kind === 'original' ? t('editor.originalTrack') : t('editor.translatedTrack')}</strong>
                  <div>
                    {track.segments.map((segment) => (
                      <button
                        type="button"
                        key={segment.id}
                        aria-label={`${track.kind === 'original' ? t('editor.originalTrack') : t('editor.translatedTrack')}: ${segment.text}`}
                        title={segment.text}
                        style={{
                          left: `${(segment.startMs / timelineDurationMs) * 100}%`,
                          width: `${Math.max(1.5, ((segment.endMs - segment.startMs) / timelineDurationMs) * 100)}%`
                        }}
                        onClick={() => seekPreview(segment.startMs)}
                      />
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        </div>

        <div className="editor-bottom-content">
      <section className="style-editor" aria-labelledby="style-editor-title">
        <h2 id="style-editor-title">{t('editor.styleEditor')}</h2>
        <div className="style-controls">
          <label>
            <span>{t('editor.fontFamily')}</span>
            <select
              aria-label={t('editor.fontFamily')}
              value={subtitleStyle.fontFamily}
              onChange={(event) => updateSubtitleStyle('fontFamily', event.currentTarget.value)}
            >
              <option value="Inter">Inter</option>
              <option value="Arial">Arial</option>
              <option value="Noto Sans">Noto Sans</option>
              <option value="DejaVu Sans">DejaVu Sans</option>
            </select>
          </label>
          <label>
            <span>{t('editor.fontSize')}</span>
            <input
              aria-label={t('editor.fontSize')}
              min={16}
              max={96}
              step={1}
              type="number"
              value={subtitleStyle.fontSizePx}
              onChange={(event) => updateSubtitleStyle('fontSizePx', Number(event.currentTarget.value))}
            />
          </label>
          <label>
            <span>{t('editor.fontWeight')}</span>
            <select
              aria-label={t('editor.fontWeight')}
              value={subtitleStyle.fontWeight}
              onChange={(event) => updateSubtitleStyle('fontWeight', event.currentTarget.value as SubtitleStyle['fontWeight'])}
            >
              <option value="regular">{t('editor.weightRegular')}</option>
              <option value="medium">{t('editor.weightMedium')}</option>
              <option value="semibold">{t('editor.weightSemibold')}</option>
              <option value="bold">{t('editor.weightBold')}</option>
            </select>
          </label>
          <label>
            <span>{t('editor.textColor')}</span>
            <input
              aria-label={t('editor.textColor')}
              type="color"
              value={subtitleStyle.textColor}
              onChange={(event) => updateSubtitleStyle('textColor', event.currentTarget.value)}
            />
          </label>
          <label>
            <span>{t('editor.outline')}</span>
            <input
              aria-label={t('editor.outline')}
              type="checkbox"
              checked={subtitleStyle.outlineEnabled}
              onChange={(event) => updateSubtitleStyle('outlineEnabled', event.currentTarget.checked)}
            />
          </label>
          <label>
            <span>{t('editor.outlineColor')}</span>
            <input
              aria-label={t('editor.outlineColor')}
              type="color"
              value={subtitleStyle.outlineColor}
              onChange={(event) => updateSubtitleStyle('outlineColor', event.currentTarget.value)}
            />
          </label>
          <label>
            <span>{t('editor.outlineWidth')}</span>
            <input
              aria-label={t('editor.outlineWidth')}
              min={0}
              max={8}
              step={1}
              type="number"
              value={subtitleStyle.outlineWidthPx}
              onChange={(event) => updateSubtitleStyle('outlineWidthPx', Number(event.currentTarget.value))}
            />
          </label>
          <label>
            <span>{t('editor.shadow')}</span>
            <input
              aria-label={t('editor.shadow')}
              type="checkbox"
              checked={subtitleStyle.shadowEnabled}
              onChange={(event) => updateSubtitleStyle('shadowEnabled', event.currentTarget.checked)}
            />
          </label>
          <label>
            <span>{t('editor.position')}</span>
            <select
              aria-label={t('editor.position')}
              value={subtitleStyle.position}
              onChange={(event) => updateSubtitleStyle('position', event.currentTarget.value as SubtitleStyle['position'])}
            >
              <option value="top">{t('editor.positionTop')}</option>
              <option value="middle">{t('editor.positionMiddle')}</option>
              <option value="bottom">{t('editor.positionBottom')}</option>
            </select>
          </label>
          <label>
            <span>{t('editor.alignment')}</span>
            <select
              aria-label={t('editor.alignment')}
              value={subtitleStyle.align}
              onChange={(event) => updateSubtitleStyle('align', event.currentTarget.value as SubtitleStyle['align'])}
            >
              <option value="left">{t('editor.alignLeft')}</option>
              <option value="center">{t('editor.alignCenter')}</option>
              <option value="right">{t('editor.alignRight')}</option>
            </select>
          </label>
          <label>
            <span>{t('editor.maxWidth')}</span>
            <input
              aria-label={t('editor.maxWidth')}
              min={40}
              max={100}
              step={1}
              type="number"
              value={subtitleStyle.maxWidthPercent}
              onChange={(event) => updateSubtitleStyle('maxWidthPercent', Number(event.currentTarget.value))}
            />
          </label>
          <label>
            <span>{t('editor.maxLines')}</span>
            <select
              aria-label={t('editor.maxLines')}
              value={subtitleStyle.maxLines}
              onChange={(event) => updateSubtitleStyle('maxLines', Number(event.currentTarget.value) as SubtitleStyle['maxLines'])}
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </label>
        </div>
      </section>

      <section className="tracks-grid">
        {[originalTrack, translationTrack].map((track) =>
          track ? (
            <article key={track.id} className="track-panel">
              <h2>{track.kind === 'original' ? t('editor.originalTrack') : t('editor.translatedTrack')}</h2>
              <ol>
                {track.segments.map((segment) => (
                  <li key={segment.id}>
                    <div className="segment-time-row">
                      <label>
                        <span>{t('editor.segmentStart')}</span>
                        <input
                          aria-label={`${t('editor.segmentStart')} ${segment.id}`}
                          min={0}
                          step="0.1"
                          type="number"
                          value={msToSecondsInput(segment.startMs)}
                          onChange={(event) => handleSegmentChange(track.id, segment.id, 'startMs', event)}
                        />
                      </label>
                      <label>
                        <span>{t('editor.segmentEnd')}</span>
                        <input
                          aria-label={`${t('editor.segmentEnd')} ${segment.id}`}
                          min={0}
                          step="0.1"
                          type="number"
                          value={msToSecondsInput(segment.endMs)}
                          onChange={(event) => handleSegmentChange(track.id, segment.id, 'endMs', event)}
                        />
                      </label>
                      <time>
                        {formatTime(segment.startMs)} - {formatTime(segment.endMs)}
                      </time>
                    </div>
                    <textarea
                      aria-label={`${track.kind === 'original' ? t('editor.originalTrack') : t('editor.translatedTrack')} ${segment.id}`}
                      value={segment.text}
                      onChange={(event) => handleSegmentChange(track.id, segment.id, 'text', event)}
                    />
                  </li>
                ))}
              </ol>
            </article>
          ) : null
        )}
        {editableTracks.length === 0 ? <p className="empty-track-state">{t('editor.emptyState')}</p> : null}
      </section>
        </div>
      </section>
    </main>
  );
}

function msToSecondsInput(ms: number): string {
  return (ms / 1000).toFixed(1).replace(/\.0$/, '');
}

function secondsInputToMs(value: string): number {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.round(seconds * 1000) : 0;
}

function hasInvalidTiming(track: SubtitleTrack): boolean {
  return track.segments.some(
    (segment, index) =>
      segment.startMs < 0 ||
      segment.endMs <= segment.startMs ||
      (index > 0 && segment.startMs < track.segments[index - 1].endMs)
  );
}

function subtitlePreviewStyle(style: SubtitleStyle): CSSProperties {
  return {
    color: style.textColor,
    fontFamily: style.fontFamily,
    fontSize: `${style.fontSizePx}px`,
    fontStyle: style.italic ? 'italic' : 'normal',
    fontWeight: style.fontWeight === 'regular' ? 400 : style.fontWeight === 'medium' ? 500 : style.fontWeight === 'semibold' ? 650 : 800,
    maxWidth: `${style.maxWidthPercent}%`,
    textAlign: style.align,
    textShadow: style.shadowEnabled ? `${style.shadowOffsetX}px ${style.shadowOffsetY}px ${style.shadowBlurPx}px ${style.shadowColor}` : undefined,
    WebkitTextStroke: style.outlineEnabled ? `${style.outlineWidthPx}px ${style.outlineColor}` : undefined
  };
}

const defaultSubtitleStyle: SubtitleStyle = {
  fontFamily: 'Inter',
  fontSizePx: 42,
  fontWeight: 'semibold',
  italic: false,
  textColor: '#ffffff',
  outlineEnabled: true,
  outlineColor: '#111111',
  outlineWidthPx: 2,
  shadowEnabled: true,
  shadowColor: '#000000',
  shadowBlurPx: 3,
  shadowOffsetX: 1,
  shadowOffsetY: 2,
  position: 'bottom',
  align: 'center',
  maxWidthPercent: 84,
  maxLines: 2
};
