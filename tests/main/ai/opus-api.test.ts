import { describe, expect, it, vi } from 'vitest';
import { MemoryCredentialStore } from '../../../src/main/credentials/memory-credential-store';
import { OpusProvider } from '../../../src/main/ai/opus-provider';
import {
  alignSrtToCaptions,
  buildClipProjectBody,
  formatUsage,
  opusLanguage,
  parseSrt,
  parseUsage
} from '../../../src/main/ai/opus-api';

const SRT = `1
00:00:01,000 --> 00:00:02,500
Hello there

2
00:00:03,000 --> 00:00:04,000
Second line
`;

describe('Opus caption alignment', () => {
  it('parses usage and keeps caption timing while replacing overlapping text', () => {
    expect(parseUsage({ credits: { remaining_minutes: 1972 }, monthly: { remaining: 900, limit: 900, used: 0 } })).toEqual({
      remainingMinutes: 1972,
      monthlyRemaining: 900,
      monthlyLimit: 900,
      monthlyUsed: 0
    });
    expect(formatUsage(parseUsage({ credits: { remaining_minutes: 1972 }, monthly: { remaining: 900, limit: 900 } }))).toBe(
      '1972 min remaining; monthly 900/900'
    );
    expect(opusLanguage('sr-Latn')).toBe('sr');
    expect(opusLanguage('ko')).toBe('kr');

    expect(parseSrt(SRT)).toEqual([
      { startMs: 1000, endMs: 2500, text: 'Hello there' },
      { startMs: 3000, endMs: 4000, text: 'Second line' }
    ]);
    expect(
      alignSrtToCaptions(SRT, [
        { id: 'a', startMs: 900, endMs: 2000 },
        { id: 'b', startMs: 5000, endMs: 6000 }
      ])
    ).toEqual([{ id: 'a', text: 'Hello there' }]);
  });

  it('builds a full-video translation project and reports credits from the usage endpoint', async () => {
    expect(
      buildClipProjectBody({
        uploadId: 'UPL_1',
        title: 'clip [en]',
        sourceLanguage: 'hr',
        targetLanguage: 'en'
      })
    ).toMatchObject({
      videoUrl: 'UPL_1',
      curationPref: { skipSlicing: true },
      importPref: { sourceLang: 'hr', targetLang: 'en' }
    });

    const store = new MemoryCredentialStore();
    await store.set({ providerId: 'opus', authMode: 'api_key', secret: 'sk_test_secret_value' });
    const provider = new OpusProvider({ credentialStore: store });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ credits: { remaining_minutes: 1972 }, monthly: { remaining: 900, limit: 900, used: 0 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await provider.testConnection();

    expect(result.ok).toBe(true);
    expect(result.message).toContain('1972 min remaining');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.opus.pro/api/api-usage?q=mine',
      expect.objectContaining({ method: 'GET' })
    );
    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer sk_test_secret_value');
    vi.unstubAllGlobals();
  });
});
