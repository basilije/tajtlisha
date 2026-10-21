import { readFile } from 'node:fs/promises';
import type { SubtitleTrack, TranscriptSegment } from '../../shared/types/subtitles';
import type { SubtitlePolishRequest, TranscriptionResult, TranslationRequest } from '../../shared/types/ai';
import { validatePath } from '../media/contracts';
import { PlaceholderAiProvider, type AiProviderContext, type ProviderDefinition } from './provider';

export const openRouterProviderDefinition: ProviderDefinition = {
  id: 'openrouter',
  displayName: 'OpenRouter',
  authModes: ['api_key'],
  capabilities: {
    detectLanguage: false,
    transcription: true,
    segmentTimestamps: false,
    wordTimestamps: false,
    translation: true,
    subtitlePolish: true,
    textToSpeech: false
  },
  modelDescriptors: [
    { id: 'openai/whisper-large-v3', label: 'OpenAI Whisper Large v3', capability: 'transcription' }
  ]
};

type OpenRouterModelsPayload = {
  data?: Array<{
    id?: string;
    name?: string;
    architecture?: { output_modalities?: string[] };
  }>;
};

type OpenRouterTranscriptionPayload = {
  text?: string;
};

type OpenRouterChatPayload = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type TextSegmentPayload = {
  segments: Array<{
    id: string;
    text: string;
  }>;
};

export class OpenRouterProvider extends PlaceholderAiProvider {
  constructor(context: AiProviderContext) {
    super(openRouterProviderDefinition, context);
  }

  override async listModels(capability: keyof typeof openRouterProviderDefinition.capabilities) {
    if (capability === 'transcription') {
      return super.listModels(capability);
    }
    if (capability !== 'translation' && capability !== 'subtitlePolish') {
      return [];
    }

    const payload = await this.requestJson<OpenRouterModelsPayload>('https://openrouter.ai/api/v1/models', { method: 'GET' });
    return (payload.data ?? [])
      .filter((model) => model.id && model.architecture?.output_modalities?.includes('text'))
      .map((model) => ({
        id: model.id as string,
        label: model.name ? `${model.name} (${model.id})` : (model.id as string),
        capability
      }));
  }

  override async testConnection() {
    const checkedAt = new Date().toISOString();
    try {
      await this.requestJson<OpenRouterModelsPayload>('https://openrouter.ai/api/v1/models', { method: 'GET' });
      return { ok: true, providerId: this.id, checkedAt, message: 'OpenRouter connection verified.' };
    } catch (error) {
      return {
        ok: false,
        providerId: this.id,
        checkedAt,
        message: error instanceof Error ? error.message : 'OpenRouter connection could not be verified.'
      };
    }
  }

  override async transcribe(request: Parameters<PlaceholderAiProvider['transcribe']>[0]): Promise<TranscriptionResult> {
    validatePath(request.audioPath, 'audioPath');
    const payload = await this.requestJson<OpenRouterTranscriptionPayload>('https://openrouter.ai/api/v1/audio/transcriptions', {
      method: 'POST',
      body: JSON.stringify({
        input_audio: {
          data: (await readFile(request.audioPath)).toString('base64'),
          format: request.audioFormat
        },
        model: request.modelId ?? 'openai/whisper-large-v3',
        ...(request.autoDetectLanguage || !request.expectedLanguage ? {} : { language: request.expectedLanguage })
      })
    });
    const text = payload.text?.trim() ?? '';
    const language = request.expectedLanguage ?? 'und';
    const segments: TranscriptSegment[] = text
      ? [{ id: '0', startMs: 0, endMs: request.clipDurationMs, text, language }]
      : [];

    return {
      detectedLanguage: language,
      text,
      segments,
      providerMetadata: { provider: this.id, model: request.modelId ?? 'openai/whisper-large-v3' }
    };
  }

  override async translate(request: TranslationRequest): Promise<SubtitleTrack> {
    const translatedSegments = await this.requestSegments({
      model: request.modelId,
      instruction: 'Translate the subtitle segments. Preserve ids, timing, order, intent, and concise subtitle style.',
      input: { sourceLanguage: request.sourceLanguage, targetLanguage: request.targetLanguage, segments: request.segments }
    });

    return buildTrack('translation', request.targetLanguage, request.segments, translatedSegments, request.sourceLanguage);
  }

  override async polishSubtitles(request: SubtitlePolishRequest): Promise<SubtitleTrack> {
    const polishedSegments = await this.requestSegments({
      model: request.modelId,
      instruction: `Polish subtitle segments conservatively for ${request.mode.replace('_', ' ')}. Preserve ids, timing, order, and meaning.`,
      input: { track: request.track, maxCharsPerLine: request.maxCharsPerLine, maxLinesPerCaption: request.maxLinesPerCaption }
    });

    return {
      ...request.track,
      segments: mergeTexts(request.track.segments, polishedSegments, request.track.language)
    };
  }

  private async requestSegments(input: { model?: string; instruction: string; input: unknown }): Promise<TextSegmentPayload['segments']> {
    const payload = await this.requestJson<OpenRouterChatPayload>('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        ...(input.model ? { model: input.model } : {}),
        messages: [
          { role: 'system', content: `${input.instruction} Return JSON only: {"segments":[{"id":"...","text":"..."}]}.` },
          { role: 'user', content: JSON.stringify(input.input) }
        ]
      })
    });
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenRouter returned no text response.');
    }

    try {
      const parsed = JSON.parse(stripCodeFence(content)) as TextSegmentPayload;
      if (!Array.isArray(parsed.segments)) {
        throw new Error('missing segments');
      }
      return parsed.segments.filter((segment) => typeof segment.id === 'string' && typeof segment.text === 'string');
    } catch {
      throw new Error('OpenRouter returned an invalid subtitle response.');
    }
  }

  private async requestJson<T>(url: string, init: RequestInit): Promise<T> {
    const credential = await this.credentialStore.get(this.id);
    if (!credential?.secret) {
      throw new Error('OpenRouter API key is required before calling this provider.');
    }

    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${credential.secret}`);
    headers.set('content-type', 'application/json');
    headers.set('x-title', 'Tajtlisha');

    try {
      const response = await fetch(url, { ...init, headers });
      if (!response.ok) {
        throw new Error(openRouterHttpErrorMessage(response.status));
      }
      try {
        return (await response.json()) as T;
      } catch {
        throw new Error('OpenRouter returned an unreadable response. Please try again.');
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('OpenRouter ')) {
        throw error;
      }
      throw new Error('Unable to reach OpenRouter. Check your internet connection and try again.');
    }
  }
}

function buildTrack(
  kind: 'translation',
  language: string,
  source: TranscriptSegment[],
  replacements: TextSegmentPayload['segments'],
  sourceLanguage: string
): SubtitleTrack {
  return {
    id: `${kind}-${language}`,
    kind,
    language,
    sourceLanguage,
    targetLanguage: language,
    segments: mergeTexts(source, replacements, language)
  };
}

function mergeTexts(source: TranscriptSegment[], replacements: TextSegmentPayload['segments'], language: string): TranscriptSegment[] {
  const texts = new Map(replacements.map((segment) => [segment.id, segment.text]));
  return source.map((segment) => ({ ...segment, text: texts.get(segment.id)?.trim() || segment.text, language }));
}

function stripCodeFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
}

function openRouterHttpErrorMessage(status: number): string {
  if (status === 401 || status === 403) return 'OpenRouter rejected the API key.';
  if (status === 402) return 'OpenRouter account has no available credit for this request.';
  if (status === 429) return 'OpenRouter rate limits prevented this request. Please try again shortly.';
  if (status >= 500) return 'OpenRouter is temporarily unavailable. Please try again later.';
  return `OpenRouter request failed (HTTP ${status}).`;
}
