import type { SubtitleTrack } from '../../shared/types/subtitles';
import { type CaptionTextField, type ExportCaption, type ExportCue, captionCuesFor } from './captions';
import { assertValidSubtitleTiming } from './timing';

/** Serializes cues as SRT. Timing is validated first; '\n' inside a cue stays a line break. */
export function serializeSrtCues(cues: readonly ExportCue[]): string {
  assertValidSubtitleTiming(cues);
  if (cues.length === 0) {
    return '';
  }

  return `${cues
    .map((cue, index) =>
      [`${index + 1}`, `${formatSrtTimestamp(cue.startMs)} --> ${formatSrtTimestamp(cue.endMs)}`, normalizeCueText(cue.text)].join('\n')
    )
    .join('\n\n')}\n`;
}

export function serializeSrt(track: SubtitleTrack): string {
  return serializeSrtCues(
    track.segments.map((segment) => ({ id: segment.id, startMs: segment.startMs, endMs: segment.endMs, text: segment.text }))
  );
}

/** SRT for one text field of already shifted export captions. Blank captions are skipped. */
export function buildSrtFromCaptions(captions: readonly ExportCaption[], field: CaptionTextField): string {
  return serializeSrtCues(captionCuesFor(captions, field));
}

export function formatSrtTimestamp(ms: number): string {
  const totalMs = Math.round(ms);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const milliseconds = totalMs % 1000;

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(milliseconds, 3)}`;
}

/** Blank lines would end the cue early, so they are dropped; each line is trimmed. */
function normalizeCueText(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

function pad(value: number, size: number): string {
  return String(value).padStart(size, '0');
}
