import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryCredentialStore } from '../../../src/main/credentials/memory-credential-store';
import { openAiProviderDefinition } from '../../../src/main/ai/openai-provider';
import { openRouterProviderDefinition } from '../../../src/main/ai/openrouter-provider';
import { AiProviderRegistry, createDefaultAiProviderRegistry } from '../../../src/main/ai';
import { SubtitleWorkflowService } from '../../../src/main/ai/subtitle-workflow';

function createRegistry(): AiProviderRegistry {
  return new AiProviderRegistry(
    [openAiProviderDefinition],
    new MemoryCredentialStore()
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI provider registry', () => {
  it('lists providers with shared provider summaries', async () => {
    const registry = createRegistry();

    const providers = await registry.listProviders();

    expect(providers.map((provider) => provider.id)).toEqual(['openai']);
    expect(providers[0].capabilities.transcription).toBe(true);
  });

  it('connects, masks status, tests, and disconnects without exposing raw secrets', async () => {
    const registry = createRegistry();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 })));

    const connected = await registry.connectProvider({
      providerId: 'openai',
      authMode: 'api_key',
      secret: 'sk-test-secret-1234'
    });

    expect(connected.connected).toBe(true);
    expect(connected.activeAuthMode).toBe('api_key');
    expect(connected.maskedCredential).toBe('sk-t********1234');
    expect(JSON.stringify(connected)).not.toContain('sk-test-secret-1234');

    const testResult = await registry.testConnection('openai');
    expect(testResult.ok).toBe(true);

    const disconnected = await registry.disconnectProvider('openai');
    expect(disconnected.connected).toBe(false);
    expect(disconnected.maskedCredential).toBeUndefined();
  });

  it('verifies OpenAI over the network and returns a safe failure message', async () => {
    const registry = createRegistry();
    await registry.connectProvider({
      providerId: 'openai',
      authMode: 'api_key',
      secret: 'sk-test-secret-1234'
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'raw provider body that must not reach the renderer' } }), { status: 401 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(registry.testConnection('openai')).resolves.toMatchObject({
      ok: false,
      message: 'OpenAI rejected the API key.'
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/models',
      expect.objectContaining({ method: 'GET', headers: expect.any(Headers) })
    );
  });

  it('does not expose raw OpenAI error bodies from subtitle operations', async () => {
    const registry = createRegistry();
    await registry.connectProvider({
      providerId: 'openai',
      authMode: 'api_key',
      secret: 'sk-test-secret-1234'
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'raw provider body that must not reach the renderer' } }), { status: 500 })
      )
    );

    const result = registry.translate('openai', {
      sourceLanguage: 'en',
      targetLanguage: 'sr-Latn',
      preserveTiming: true,
      segments: [{ id: 'seg-1', startMs: 0, endMs: 1000, text: 'Hello', language: 'en' }]
    });

    await expect(result).rejects.toThrow('OpenAI is temporarily unavailable. Please try again later.');
    await expect(result).rejects.not.toThrow('raw provider body that must not reach the renderer');
  });

  it('rejects Codex auth reuse without reading private auth cache files', async () => {
    const registry = createRegistry();

    await expect(
      registry.connectProvider({
        providerId: 'openai',
        authMode: 'codex_auth_experimental',
        secret: 'unused'
      })
    ).rejects.toThrow('Tajtlisha will not read ~/.codex/auth.json');
  });

  it('exposes OpenRouter with transcription and text capabilities', async () => {
    const registry = createDefaultAiProviderRegistry(new MemoryCredentialStore());

    await expect(registry.listProviders()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'openai' }),
        expect.objectContaining({ id: 'openrouter', capabilities: expect.objectContaining({ transcription: true, translation: true }) })
      ])
    );
  });

  it('lists OpenRouter transcription models and verifies its API key over the network', async () => {
    const registry = new AiProviderRegistry([openRouterProviderDefinition], new MemoryCredentialStore());
    await registry.connectProvider({ providerId: 'openrouter', authMode: 'api_key', secret: 'sk-or-test-secret' });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(registry.listModels('openrouter', 'transcription')).resolves.toEqual([
      expect.objectContaining({ id: 'openai/whisper-large-v3' })
    ]);
    await expect(registry.testConnection('openrouter')).resolves.toMatchObject({ ok: true, providerId: 'openrouter' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models',
      expect.objectContaining({ method: 'GET', headers: expect.any(Headers) })
    );
  });

  it('reports an unreadable OpenRouter response without masking it as a network failure', async () => {
    const registry = new AiProviderRegistry([openRouterProviderDefinition], new MemoryCredentialStore());
    await registry.connectProvider({ providerId: 'openrouter', authMode: 'api_key', secret: 'sk-or-test-secret' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not-json', { status: 200 })));

    await expect(registry.testConnection('openrouter')).resolves.toMatchObject({
      ok: false,
      message: 'OpenRouter returned an unreadable response. Please try again.'
    });
  });

  it('requires a credential before running OpenAI operations', async () => {
    const registry = createRegistry();

    await expect(
      registry.transcribe('openai', {
        audioPath: '/tmp/audio.wav',
        audioFormat: 'wav',
        autoDetectLanguage: true,
        clipDurationMs: 1000
      })
    ).rejects.toThrow('OpenAI API key is required');
  });

  it('runs OpenAI transcription through the provider contract without exposing secrets', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'tajtlisha-ai-'));
    const audioPath = join(tempDir, 'audio.wav');
    await writeFile(audioPath, 'fake wav');

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          language: 'en',
          text: 'Hello world',
          segments: [{ id: 0, start: 0, end: 1.25, text: 'Hello world', avg_logprob: -0.1 }]
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    try {
      const registry = createRegistry();
      await registry.connectProvider({
        providerId: 'openai',
        authMode: 'api_key',
        secret: 'sk-test-secret-1234'
      });

      const result = await registry.transcribe('openai', {
        audioPath,
        audioFormat: 'wav',
        autoDetectLanguage: true,
        clipDurationMs: 2000
      });

      expect(result.detectedLanguage).toBe('en');
      expect(result.segments[0]).toMatchObject({
        id: '0',
        startMs: 0,
        endMs: 1250,
        text: 'Hello world',
        language: 'en'
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.openai.com/v1/audio/transcriptions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.any(Headers)
        })
      );
      expect(JSON.stringify(result)).not.toContain('sk-test-secret-1234');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('runs OpenAI translation while preserving segment timing', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            segments: [{ id: 'seg-1', text: 'Zdravo' }]
          })
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const registry = createRegistry();
    await registry.connectProvider({
      providerId: 'openai',
      authMode: 'api_key',
      secret: 'sk-test-secret-1234'
    });

    await expect(
      registry.translate('openai', {
        sourceLanguage: 'en',
        targetLanguage: 'sr-Latn',
        preserveTiming: true,
        segments: [{ id: 'seg-1', startMs: 0, endMs: 1000, text: 'Hello', language: 'en' }]
      })
    ).resolves.toMatchObject({
      kind: 'translation',
      language: 'sr-Latn',
      segments: [{ id: 'seg-1', startMs: 0, endMs: 1000, text: 'Zdravo', language: 'sr-Latn' }]
    });
  });

  it('generates subtitle tracks from a trimmed video workflow and cleans temporary audio', async () => {
    const calls: string[] = [];
    let audioPath = '';
    const service = new SubtitleWorkflowService(
      {
        transcribe: async (_providerId, request) => {
          audioPath = request.audioPath;
          calls.push(`transcribe:${request.clipDurationMs}`);
          return {
            detectedLanguage: 'en',
            text: 'Hello',
            segments: [{ id: 'seg-1', startMs: 0, endMs: 1000, text: 'Hello', language: 'en' }]
          };
        },
        translate: async (_providerId, request) => {
          calls.push(`translate:${request.targetLanguage}`);
          return {
            id: 'translation-sr-Latn',
            kind: 'translation',
            language: request.targetLanguage,
            sourceLanguage: request.sourceLanguage,
            targetLanguage: request.targetLanguage,
            segments: request.segments.map((segment) => ({ ...segment, text: 'Zdravo', language: request.targetLanguage }))
          };
        },
        polishSubtitles: async (_providerId, request) => {
          calls.push(`polish:${request.mode}`);
          return {
            ...request.track,
            segments: request.track.segments.map((segment) => ({ ...segment, text: `${segment.text}!` }))
          };
        }
      },
      {
        extractAudio: async (input) => {
          await writeFile(input.outputPath, 'fake wav');
          return { outputPath: input.outputPath, format: input.format, durationMs: 2000 };
        }
      }
    );

    const result = await service.generateSubtitles({
      inputPath: '/clips/source.mp4',
      trim: { startMs: 1000, endMs: 3000, knownDurationMs: 5000 },
      providerId: 'openai',
      autoDetectLanguage: true,
      targetLanguage: 'sr-Latn',
      polish: true,
      polishMode: 'conservative',
      maxCharsPerLine: 42,
      maxLinesPerCaption: 2
    });

    expect(calls).toEqual(['transcribe:2000', 'translate:sr-Latn', 'polish:conservative']);
    expect(result.originalTrack.kind).toBe('original');
    expect(result.originalTrack.segments[0]).toMatchObject({ startMs: 1000, endMs: 2000 });
    expect(result.translatedTrack.segments[0]).toMatchObject({ startMs: 1000, endMs: 2000 });
    expect(result.translatedTrack.segments[0].text).toBe('Zdravo!');
    await expect(writeFile(audioPath, 'after cleanup')).rejects.toThrow();
  });
});
