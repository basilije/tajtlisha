import { describe, expect, it } from 'vitest';
import { decodeSubtitleBytes, parseSrtCues } from '../../../src/main/subtitles/parse-srt';

const SAMPLE = `1
00:00:01,000 --> 00:00:04,500
Hello
world

2
00:00:05.200 --> 00:00:06.200
<i>Again</i>

3
00:00:07,000 --> 00:00:07,000
zero

`;

describe('parseSrtCues', () => {
  it('reads cues, strips tags, and skips a cue with no duration', () => {
    expect(parseSrtCues(SAMPLE)).toEqual([
      { startMs: 1000, endMs: 4500, text: 'Hello\nworld' },
      { startMs: 5200, endMs: 6200, text: 'Again' }
    ]);
  });

  it('accepts a UTF-8 BOM and Windows line endings', () => {
    const source = '\uFEFF1\r\n00:01:00,250 --> 00:01:01,000\r\nJedan\r\n';
    expect(parseSrtCues(source)).toEqual([{ startMs: 60250, endMs: 61000, text: 'Jedan' }]);
  });

  it('returns nothing for a file without timestamps', () => {
    expect(parseSrtCues('just some notes\n')).toEqual([]);
  });
});

describe('decodeSubtitleBytes', () => {
  it('decodes UTF-8 and UTF-16 LE subtitles', () => {
    expect(decodeSubtitleBytes(Buffer.from('\uFEFFhello', 'utf8'))).toBe('hello');
    const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('A', 'utf16le')]);
    expect(decodeSubtitleBytes(utf16)).toBe('A');
  });
});
