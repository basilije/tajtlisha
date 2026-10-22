import type { ProviderTextItem } from './provider';

export const OPUS_API = 'https://api.opus.pro/api';

const DONE_STAGES = new Set(['COMPLETE', 'COMPLETED', 'READY', 'SUCCEEDED']);
const FAILED_STAGES = new Set(['FAILED', 'ERROR', 'CANCELLED', 'CANCELED']);

export type OpusUsage = {
  remainingMinutes: number | null;
  monthlyRemaining: number | null;
  monthlyLimit: number | null;
  monthlyUsed: number | null;
};

export type OpusSrtCue = {
  startMs: number;
  endMs: number;
  text: string;
};

export function parseUsage(body: unknown): OpusUsage {
  const record = isRecord(body) ? body : {};
  const credits = isRecord(record.credits) ? record.credits : {};
  const monthly = isRecord(record.monthly) ? record.monthly : {};
  return {
    remainingMinutes: finiteNumber(credits.remaining_minutes),
    monthlyRemaining: finiteNumber(monthly.remaining),
    monthlyLimit: finiteNumber(monthly.limit),
    monthlyUsed: finiteNumber(monthly.used)
  };
}

export function formatUsage(usage: OpusUsage): string {
  const parts: string[] = [];
  if (usage.remainingMinutes !== null) parts.push(`${usage.remainingMinutes} min remaining`);
  if (usage.monthlyRemaining !== null && usage.monthlyLimit !== null) {
    parts.push(`monthly ${usage.monthlyRemaining}/${usage.monthlyLimit}`);
  }
  return parts.join('; ');
}

/** Tajtlisha language codes to the ISO code Opus accepts. Korean is `kr` on that API. */
export function opusLanguage(code: string): string {
  const base = code.trim().toLowerCase().split('-')[0];
  if (!base || base === 'und') return '';
  return base === 'ko' ? 'kr' : base;
}

export function buildClipProjectBody(input: {
  uploadId: string;
  title: string;
  sourceLanguage: string;
  targetLanguage: string;
}): Record<string, unknown> {
  const importPref: Record<string, string> = { targetLang: input.targetLanguage };
  if (input.sourceLanguage) importPref.sourceLang = input.sourceLanguage;
  return {
    videoUrl: input.uploadId,
    uploadedVideoAttr: { title: input.title },
    curationPref: { skipSlicing: true },
    renderPref: { enableCaption: true },
    importPref
  };
}

export function parseSrt(source: string): OpusSrtCue[] {
  const blocks = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim().split(/\n{2,}/);
  const cues: OpusSrtCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trimEnd());
    const timeIndex = lines.findIndex((line) => line.includes('-->'));
    if (timeIndex < 0) continue;
    const match = lines[timeIndex].match(
      /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/
    );
    if (!match) continue;
    const text = lines
      .slice(timeIndex + 1)
      .join('\n')
      .trim();
    if (!text) continue;
    cues.push({
      startMs: stampToMs(match[1], match[2], match[3], match[4]),
      endMs: stampToMs(match[5], match[6], match[7], match[8]),
      text
    });
  }
  return cues;
}

/**
 * Keeps each caption's existing timing. A cue contributes when its interval
 * overlaps the caption. Captions with no overlap are omitted so the caller
 * can fail instead of copying the source text.
 */
export function alignSrtToCaptions(
  srt: string,
  captions: Array<{ id: string; startMs: number; endMs: number }>
): ProviderTextItem[] {
  const cues = parseSrt(srt);
  const items: ProviderTextItem[] = [];
  for (const caption of captions) {
    const text = cues
      .filter((cue) => cue.startMs < caption.endMs && cue.endMs > caption.startMs)
      .map((cue) => cue.text)
      .join('\n')
      .trim();
    if (text) items.push({ id: caption.id, text });
  }
  return items;
}

export function isFinishedStage(stage: string, error: unknown, transcriptUrl: unknown): transcriptUrl is string {
  return DONE_STAGES.has(stage) && !error && typeof transcriptUrl === 'string' && transcriptUrl.length > 0;
}

export function isFailedStage(stage: string, error: unknown): boolean {
  return FAILED_STAGES.has(stage) || Boolean(error);
}

function stampToMs(hours: string, minutes: string, seconds: string, fraction: string): number {
  const millis = Number(fraction.padEnd(3, '0').slice(0, 3));
  return (Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000 + millis;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
