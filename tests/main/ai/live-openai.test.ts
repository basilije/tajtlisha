import { stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryCredentialStore } from '../../../src/main/credentials/memory-credential-store';
import { AiProviderRegistry } from '../../../src/main/ai';
import { OpenAiProvider } from '../../../src/main/ai/openai-provider';
import { buildCaptionsFromWords } from '../../../src/main/ai/caption-builder';
import type { ProviderAudioFormat } from '../../../src/main/ai/provider';

/**
 * Real OpenAI call. Runs only when TAJTLISHA_LIVE_OPENAI_KEY and
 * TAJTLISHA_LIVE_AUDIO (path to a short speech clip: mp3, wav, m4a, mp4) are set.
 * Costs money and needs network access, so it is skipped in normal runs.
 */
const liveKey = process.env.TAJTLISHA_LIVE_OPENAI_KEY;
const liveAudio = process.env.TAJTLISHA_LIVE_AUDIO;
const live = Boolean(liveKey && liveAudio);

describe.skipIf(!live)('live OpenAI transcription and translation', () => {
  it('transcribes with whisper-1, translates to sr-Latn, and prints the captions', async () => {
    const audioPath = liveAudio as string;
    await stat(audioPath);

    const credentialStore = new MemoryCredentialStore();
    await credentialStore.set({ providerId: 'openai', authMode: 'api_key', secret: liveKey as string });
    const registry = new AiProviderRegistry([new OpenAiProvider({ credentialStore })], credentialStore);

    const transcription = await registry.transcribe('openai', {
      audioPath,
      audioFormat: audioFormatOf(audioPath),
      modelId: 'whisper-1'
    });

    expect(transcription.text.trim().length).toBeGreaterThan(0);
    expect(transcription.words?.length ?? 0).toBeGreaterThan(0);

    const captions = buildCaptionsFromWords(transcription.words ?? [], {
      maxCharsPerLine: 42,
      maxLinesPerCaption: 2
    });
    const items = captions.map((caption, index) => ({ id: `caption-${index}`, text: caption.text }));

    const translated = await registry.translateTexts('openai', {
      items,
      sourceLanguage: transcription.language,
      targetLanguage: 'sr-Latn',
      modelId: 'gpt-4.1-mini',
      maxCharsPerLine: 42,
      maxLinesPerCaption: 2
    });

    expect(translated.map((item) => item.id)).toEqual(items.map((item) => item.id));

    const lines = captions.map((caption, index) => {
      const translation = translated.find((item) => item.id === `caption-${index}`)?.text ?? '';
      return `${formatTimestamp(caption.startMs)} --> ${formatTimestamp(caption.endMs)}\n${caption.text}\n${translation}`;
    });
    // Printed on purpose: this test exists to eyeball real output.
    console.log(lines.join('\n\n'));
  }, 120_000);
});

function audioFormatOf(path: string): ProviderAudioFormat {
  const extension = extname(path).toLowerCase();
  if (extension === '.wav') return 'wav';
  if (extension === '.m4a') return 'm4a';
  return 'mp3';
}

function formatTimestamp(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':') + `,${String(millis).padStart(3, '0')}`;
}

