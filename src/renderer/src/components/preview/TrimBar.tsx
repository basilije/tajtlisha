import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { clamp } from '../../../../shared/subtitle-geometry';
import type { TrimRange } from '../../../../shared/types/project';
import { formatSeconds, formatTimecode, parseTimecode } from '../../utils/time';
import {
  KEY_STEP_LARGE_MS,
  KEY_STEP_MS,
  MIN_TRIM_MS,
  moveTrimHandle,
  msFromClientX,
  pickTickStep,
  ticksFor,
  timeToPercent,
  type TrimHandle
} from './trimMath';
import './preview.css';

export type TrimBarCaption = {
  id: string;
  startMs: number;
  endMs: number;
  hasIssue?: boolean;
};

export type TrimBarProps = {
  /** Length of the whole source video. */
  durationMs: number;
  trim: TrimRange;
  currentTimeMs: number;
  captions: TrimBarCaption[];
  selectedCaptionId?: string | null;
  onTrimChange: (range: TrimRange) => void;
  onSeek: (ms: number) => void;
  onSelectCaption?: (id: string) => void;
};

/**
 * Trim range over the whole source: dimmed outside the kept range, two
 * draggable and keyboard-adjustable handles, a playhead and caption blocks.
 * Timecode fields below the track edit the same range.
 */
export function TrimBar({
  durationMs,
  trim,
  currentTimeMs,
  captions,
  selectedCaptionId = null,
  onTrimChange,
  onSeek,
  onSelectCaption
}: TrimBarProps) {
  const { t } = useTranslation();
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<TrimHandle | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width !== undefined) setTrackWidth(width);
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  const duration = Math.max(0, durationMs);
  const pct = (ms: number) => timeToPercent(ms, duration);
  const tickStep = pickTickStep(duration, trackWidth);
  const ticks = ticksFor(duration, tickStep);
  const keptLengthMs = Math.max(0, trim.endMs - trim.startMs);

  const timeAt = (clientX: number): number | null => {
    const rect = trackRef.current?.getBoundingClientRect();
    return rect ? msFromClientX(clientX, rect, duration) : null;
  };

  const commit = (next: TrimRange) => {
    if (next.startMs === trim.startMs && next.endMs === trim.endMs) return;
    onTrimChange(next);
  };

  const handlePointerDown = (handle: TrimHandle) => (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = handle;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const handle = dragRef.current;
    if (!handle) return;

    const ms = timeAt(event.clientX);
    if (ms === null) return;
    commit(moveTrimHandle(trim, handle, ms, duration));
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const handleKeyDown = (handle: TrimHandle) => (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

    event.preventDefault();
    const step = event.shiftKey ? KEY_STEP_LARGE_MS : KEY_STEP_MS;
    const direction = event.key === 'ArrowLeft' ? -1 : 1;
    const current = handle === 'start' ? trim.startMs : trim.endMs;
    commit(moveTrimHandle(trim, handle, current + direction * step, duration));
  };

  // Plain clicks on the track seek. Clicks on handles and caption blocks are handled by those controls.
  const handleTrackClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest('[data-track-control]')) return;

    const ms = timeAt(event.clientX);
    if (ms !== null) onSeek(ms);
  };

  return (
    <div className="trim-bar" role="group" aria-label={t('preview.trimRange')}>
      <div className="trim-ruler" aria-hidden="true">
        {ticks.map((ms) => (
          <span key={ms} className="trim-tick" style={{ left: `${pct(ms)}%` }}>
            {formatTimecode(ms)}
          </span>
        ))}
      </div>

      <div
        ref={trackRef}
        className="trim-track"
        onClick={handleTrackClick}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="trim-dim" style={{ left: 0, width: `${pct(trim.startMs)}%` }} />
        <div className="trim-dim" style={{ left: `${pct(trim.endMs)}%`, right: 0 }} />

        {captions.map((caption) => {
          const selected = caption.id === selectedCaptionId;
          const label = t('preview.captionBlock', { time: formatTimecode(caption.startMs) });
          return (
            <button
              key={caption.id}
              type="button"
              data-track-control
              aria-label={label}
              aria-pressed={selected}
              title={label}
              className={caption.hasIssue ? 'trim-caption is-issue' : 'trim-caption'}
              style={{
                left: `${pct(caption.startMs)}%`,
                width: `${Math.max(0, pct(caption.endMs) - pct(caption.startMs))}%`
              }}
              onClick={() => {
                onSelectCaption?.(caption.id);
                onSeek(caption.startMs);
              }}
            />
          );
        })}

        <div
          role="slider"
          tabIndex={0}
          data-track-control
          className="trim-handle"
          aria-label={t('preview.trimStartHandle')}
          aria-valuemin={0}
          aria-valuemax={Math.max(0, trim.endMs - MIN_TRIM_MS)}
          aria-valuenow={trim.startMs}
          aria-valuetext={formatTimecode(trim.startMs, { precision: 'ms' })}
          style={{ left: `${pct(trim.startMs)}%` }}
          onPointerDown={handlePointerDown('start')}
          onKeyDown={handleKeyDown('start')}
        />
        <div
          role="slider"
          tabIndex={0}
          data-track-control
          className="trim-handle"
          aria-label={t('preview.trimEndHandle')}
          aria-valuemin={trim.startMs + MIN_TRIM_MS}
          aria-valuemax={duration}
          aria-valuenow={trim.endMs}
          aria-valuetext={formatTimecode(trim.endMs, { precision: 'ms' })}
          style={{ left: `${pct(trim.endMs)}%` }}
          onPointerDown={handlePointerDown('end')}
          onKeyDown={handleKeyDown('end')}
        />

        <div className="trim-playhead" style={{ left: `${pct(currentTimeMs)}%` }} />
      </div>

      <div className="trim-controls">
        <TimecodeInput
          label={t('preview.startTime')}
          valueMs={trim.startMs}
          minMs={0}
          maxMs={Math.max(0, trim.endMs - MIN_TRIM_MS)}
          onCommit={(startMs) => commit({ startMs, endMs: trim.endMs })}
        />
        <button
          type="button"
          className="btn btn-sm"
          onClick={() =>
            commit({ startMs: clamp(currentTimeMs, 0, Math.max(0, trim.endMs - MIN_TRIM_MS)), endMs: trim.endMs })
          }
        >
          {t('preview.setStartAtPlayhead')}
        </button>
        <TimecodeInput
          label={t('preview.endTime')}
          valueMs={trim.endMs}
          minMs={trim.startMs + MIN_TRIM_MS}
          maxMs={duration}
          onCommit={(endMs) => commit({ startMs: trim.startMs, endMs })}
        />
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => commit({ startMs: trim.startMs, endMs: clamp(currentTimeMs, trim.startMs + MIN_TRIM_MS, duration) })}
        >
          {t('preview.setEndAtPlayhead')}
        </button>
        <span className="trim-kept-duration">
          {t('preview.keptDuration', { seconds: formatSeconds(keptLengthMs) })}
        </span>
      </div>
    </div>
  );
}

type TimecodeInputProps = {
  label: string;
  valueMs: number;
  minMs: number;
  maxMs: number;
  onCommit: (ms: number) => void;
};

/**
 * Editable timecode. Enter or blur commits a valid value inside [minMs, maxMs].
 * Anything else (unparseable, out of range, Escape) reverts to the current value.
 */
function TimecodeInput({ label, valueMs, minMs, maxMs, onCommit }: TimecodeInputProps) {
  const { t } = useTranslation();
  const displayed = formatTimecode(valueMs, { precision: 'ms' });
  const [draft, setDraft] = useState(displayed);

  useEffect(() => {
    setDraft(displayed);
  }, [displayed]);

  const commitDraft = () => {
    const ms = parseTimecode(draft);
    if (ms === null || ms < minMs || ms > maxMs) {
      setDraft(displayed);
      return;
    }

    if (ms !== valueMs) onCommit(ms);
    setDraft(formatTimecode(ms, { precision: 'ms' }));
  };

  return (
    <label className="field trim-timecode">
      <span className="field-label">{label}</span>
      <input
        className="input input-mono"
        inputMode="decimal"
        value={draft}
        aria-invalid={parseTimecode(draft) === null}
        title={t('preview.timecodeHint')}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commitDraft();
          if (event.key === 'Escape') setDraft(displayed);
        }}
      />
    </label>
  );
}
