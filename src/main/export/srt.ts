import { writeFile } from 'node:fs/promises';
import type { WriteSrtRequest, WriteSrtResult } from '../../shared/types/export';
import type { SubtitleTrack } from '../../shared/types/subtitles';
import { assertValidSubtitleTiming } from './timing';

export function serializeSrt(track: SubtitleTrack): string {
  assertValidSubtitleTiming(track);

  return `${track.segments
    .map((segment, index) => {
      const text = normalizeSubtitleText(segment.text);
      return [`${index + 1}`, `${formatSrtTimestamp(segment.startMs)} --> ${formatSrtTimestamp(segment.endMs)}`, text].join('\n');
    })
    .join('\n\n')}\n`;
}

export async function writeSrt(input: WriteSrtRequest): Promise<WriteSrtResult> {
  const srt = serializeSrt(input.track);
  await writeFile(input.outputPath, srt, { encoding: 'utf8', flag: input.overwriteExisting ? 'w' : 'wx' });
  return {
    outputPath: input.outputPath,
    segmentCount: input.track.segments.length
  };
}

export function formatSrtTimestamp(ms: number): string {
  const totalMs = Math.round(ms);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const milliseconds = totalMs % 1000;

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(milliseconds, 3)}`;
}

function normalizeSubtitleText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function pad(value: number, size: number): string {
  return String(value).padStart(size, '0');
}
