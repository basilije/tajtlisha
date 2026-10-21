import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { TranscriptionResult, TranslationRequest, SubtitlePolishRequest } from '../../shared/types/ai';
import type { SubtitleTrack, TranscriptSegment } from '../../shared/types/subtitles';
import { validatePath } from '../media/contracts';
import { PlaceholderAiProvider, type AiProviderContext, type ProviderDefinition } from './provider';

export const openAiProviderDefinition: ProviderDefinition = {
  id: 'openai',
  displayName: 'OpenAI',
  authModes: ['api_key'],
  capabilities: {
    detectLanguage: true,
    transcription: true,
    segmentTimestamps: true,
    wordTimestamps: true,
    translation: true,
    subtitlePolish: true,
    textToSpeech: false
  },
  modelDescriptors: [
    { id: 'gpt-4o-transcribe', label: 'GPT-4o Transcribe', capability: 'transcription' },
    { id: 'gpt-4o-mini-transcribe', label: 'GPT-4o mini Transcribe', capability: 'transcription' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', capability: 'translation' },
    { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', capability: 'subtitlePolish' }
  ]
};

type OpenAiVerboseTranscription = {
  language?: string;
  text?: string;
  segments?: Array<{
    id?: string | number;
    start?: number;
    end?: number;
    text?: string;
    avg_logprob?: number;
  }>;
};

type OpenAiTextResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type TextSegmentPayload = {
  segments: Array<{
    id: string;
    text: string;
  }>;
};

export class OpenAiProvider extends PlaceholderAiProvider {
  constructor(context: AiProviderContext) {
    super(openAiProviderDefinition, context);
  }

  override async transcribe(request: Parameters<PlaceholderAiProvider['transcribe']>[0]): Promise<TranscriptionResult> {
    validatePath(request.audioPath, 'audioPath');
    await this.requireCredentialSecret();

    const form = new FormData();
    form.set('model', request.modelId ?? 'gpt-4o-mini-transcribe');
    form.set('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'segment');

    if (!request.autoDetectLanguage && request.expectedLanguage) {
      form.set('language', request.expectedLanguage);
    }

    const audio = new Blob([await readFile(request.audioPath)], { type: mimeTypeForAudioFormat(request.audioFormat) });
    form.set('file', audio, basename(request.audioPath));

    const payload = await this.requestJson<OpenAiVerboseTranscription>('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      body: form
    });
    const detectedLanguage = payload.language ?? request.expectedLanguage ?? 'und';
    const text = payload.text?.trim() ?? '';
    const segments = normalizeTranscriptionSegments(payload, request.clipDurationMs, detectedLanguage);

    return {
      detectedLanguage,
      text,
      segments,
      providerMetadata: {
        provider: this.id,
        model: request.modelId ?? 'gpt-4o-mini-transcribe'
      }
    };
  }

  override async testConnection() {
    const checkedAt = new Date().toISOString();

    try {
      await this.request('https://api.openai.com/v1/models', { method: 'GET' });
      return {
        ok: true,
        providerId: this.id,
        checkedAt,
        message: 'OpenAI connection verified.'
      };
    } catch (error) {
      return {
        ok: false,
        providerId: this.id,
        checkedAt,
        message: error instanceof Error ? error.message : 'OpenAI connection could not be verified.'
      };
    }
  }

  override async translate(request: TranslationRequest): Promise<SubtitleTrack> {
    const payload = await this.requestStructuredSegments({
      model: request.modelId ?? 'gpt-4.1-mini',
      instruction: [
        'Translate subtitle segments.',
        'Preserve the original meaning, speaker intent, and concise subtitle style.',
        'Return exactly one translated text item for each input id.',
        'Do not change timing, ids, or segment order.'
      ].join(' '),
      input: {
        sourceLanguage: request.sourceLanguage,
        targetLanguage: request.targetLanguage,
        segments: request.segments.map(({ id, text }) => ({ id, text }))
      }
    });

    return {
      id: `translation-${request.targetLanguage}`,
      kind: 'translation',
      language: request.targetLanguage,
      sourceLanguage: request.sourceLanguage,
      targetLanguage: request.targetLanguage,
      segments: mergeTextOntoSegments(request.segments, payload, request.targetLanguage)
    };
  }

  override async polishSubtitles(request: SubtitlePolishRequest): Promise<SubtitleTrack> {
    const payload = await this.requestStructuredSegments({
      model: request.modelId ?? 'gpt-4.1-mini',
      instruction: [
        'Polish subtitle text without changing meaning.',
        `Mode: ${request.mode}.`,
        `Keep each caption to at most ${request.maxLinesPerCaption} line(s) and about ${request.maxCharsPerLine} characters per line.`,
        'Return exactly one polished text item for each input id.',
        'Do not change timing, ids, language, or segment order.'
      ].join(' '),
      input: {
        language: request.track.language,
        segments: request.track.segments.map(({ id, text }) => ({ id, text }))
      }
    });

    return {
      ...request.track,
      segments: mergeTextOntoSegments(request.track.segments, payload, request.track.language)
    };
  }

  private async requestStructuredSegments(input: { model: string; instruction: string; input: unknown }): Promise<TextSegmentPayload> {
    const response = await this.requestJson<OpenAiTextResponse>('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: input.model,
        store: false,
        input: [
          {
            role: 'system',
            content: input.instruction
          },
          {
            role: 'user',
            content: JSON.stringify(input.input)
          }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'subtitle_segments',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['segments'],
              properties: {
                segments: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['id', 'text'],
                    properties: {
                      id: { type: 'string' },
                      text: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      })
    });

    return parseTextSegmentPayload(extractOutputText(response));
  }

  private async requestJson<T>(url: string, init: RequestInit): Promise<T> {
    const response = await this.request(url, init);

    try {
      return (await response.json()) as T;
    } catch {
      throw new Error('OpenAI returned an unreadable response. Please try again.');
    }
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const secret = await this.requireCredentialSecret();
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${secret}`);

    try {
      const response = await fetch(url, { ...init, headers });
      if (!response.ok) {
        throw new Error(openAiHttpErrorMessage(response.status));
      }

      return response;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('OpenAI ')) {
        throw error;
      }

      throw new Error('Unable to reach OpenAI. Check your internet connection and try again.');
    }
  }

  private async requireCredentialSecret(): Promise<string> {
    const credential = await this.credentialStore.get(this.id);
    if (!credential?.secret) {
      throw new Error('OpenAI API key is required before calling this provider.');
    }

    return credential.secret;
  }
}

function openAiHttpErrorMessage(status: number): string {
  if (status === 401 || status === 403) {
    return 'OpenAI rejected the API key.';
  }

  if (status === 429) {
    return 'OpenAI rate limit or quota blocked this request. Check Platform billing, project budget, and rate limits.';
  }

  if (status >= 500) {
    return 'OpenAI is temporarily unavailable. Please try again later.';
  }

  return `OpenAI request failed (HTTP ${status}).`;
}

function mimeTypeForAudioFormat(format: 'wav' | 'mp3' | 'm4a'): string {
  switch (format) {
    case 'wav':
      return 'audio/wav';
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
      return 'audio/mp4';
  }
}

function normalizeTranscriptionSegments(
  payload: OpenAiVerboseTranscription,
  clipDurationMs: number,
  language: string
): TranscriptSegment[] {
  const segments = payload.segments
    ?.filter((segment) => typeof segment.text === 'string' && typeof segment.start === 'number' && typeof segment.end === 'number')
    .map((segment, index) => ({
      id: String(segment.id ?? `seg-${index + 1}`),
      startMs: Math.max(0, Math.round((segment.start ?? 0) * 1000)),
      endMs: Math.max(1, Math.round((segment.end ?? 0) * 1000)),
      text: segment.text?.trim() ?? '',
      language,
      confidence: typeof segment.avg_logprob === 'number' ? Math.max(0, Math.min(1, Math.exp(segment.avg_logprob))) : undefined
    }));

  if (segments?.length) {
    return segments;
  }

  return [
    {
      id: 'seg-1',
      startMs: 0,
      endMs: Math.max(1, clipDurationMs),
      text: payload.text?.trim() ?? '',
      language,
      confidence: 0.5
    }
  ];
}

function extractOutputText(response: OpenAiTextResponse): string {
  if (response.output_text) {
    return response.output_text;
  }

  const text = response.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === 'output_text' && typeof content.text === 'string')?.text;

  if (!text) {
    throw new Error('OpenAI response did not contain output text.');
  }

  return text;
}

function parseTextSegmentPayload(text: string): TextSegmentPayload {
  const payload = JSON.parse(text) as TextSegmentPayload;
  if (!Array.isArray(payload.segments)) {
    throw new Error('OpenAI response did not contain subtitle segments.');
  }

  return payload;
}

function mergeTextOntoSegments(source: TranscriptSegment[], payload: TextSegmentPayload, language: string): TranscriptSegment[] {
  const byId = new Map(payload.segments.map((segment) => [segment.id, segment.text]));
  return source.map((segment) => ({
    ...segment,
    text: byId.get(segment.id)?.trim() || segment.text,
    language
  }));
}
