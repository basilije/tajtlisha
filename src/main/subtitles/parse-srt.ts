export type ImportedSrtCue = {
  startMs: number;
  endMs: number;
  text: string;
};

const TIME_RANGE =
  /^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/;

/** Turns a picked subtitle file into text. UTF-16 BOM is honored; otherwise the bytes are UTF-8. */
export function decodeSubtitleBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return Buffer.from(bytes.buffer, bytes.byteOffset + 2, bytes.byteLength - 2).toString('utf16le');
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.alloc(bytes.byteLength - 2);
    for (let index = 2; index + 1 < bytes.byteLength; index += 2) {
      swapped[index - 2] = bytes[index + 1] ?? 0;
      swapped[index - 1] = bytes[index] ?? 0;
    }
    return swapped.toString('utf16le');
  }
  return Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/, '');
}

/** Reads SRT cues. Blank cues and cues with no positive duration are skipped. */
export function parseSrtCues(source: string): ImportedSrtCue[] {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const cues: ImportedSrtCue[] = [];

  for (const block of text.split(/\n{2,}/)) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const timeIndex = lines.findIndex((line) => line.includes('-->'));
    if (timeIndex < 0) continue;

    const range = parseTimeRange(lines[timeIndex] ?? '');
    if (!range || range.endMs <= range.startMs) continue;

    const body = lines
      .slice(timeIndex + 1)
      .map((line) => line.replace(/<[^>\n]+>/g, '').trim())
      .filter((line) => line.length > 0)
      .join('\n');
    if (!body) continue;

    cues.push({ startMs: range.startMs, endMs: range.endMs, text: body });
  }

  return cues;
}

function parseTimeRange(line: string): { startMs: number; endMs: number } | undefined {
  const match = TIME_RANGE.exec(line);
  if (!match) return undefined;
  return {
    startMs: timestampToMs(match[1] ?? '', match[2] ?? '', match[3] ?? '', match[4] ?? ''),
    endMs: timestampToMs(match[5] ?? '', match[6] ?? '', match[7] ?? '', match[8] ?? '')
  };
}

function timestampToMs(hours: string, minutes: string, seconds: string, fraction: string): number {
  const milliseconds = Number(fraction.padEnd(3, '0').slice(0, 3));
  return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + milliseconds;
}
