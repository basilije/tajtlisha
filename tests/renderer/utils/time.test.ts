import { formatSeconds, formatTimecode, parseTimecode } from '../../../src/renderer/src/utils/time';

describe('time utils', () => {
  it('formats tenths and milliseconds', () => {
    expect(formatTimecode(0)).toBe('0:00.0');
    expect(formatTimecode(62_549)).toBe('1:02.5');
    expect(formatTimecode(62_549, { precision: 'ms' })).toBe('1:02.549');
    expect(formatTimecode(-5)).toBe('0:00.0');
    expect(formatSeconds(2_550)).toBe('2.5');
  });

  it('parses common inputs', () => {
    expect(parseTimecode('1:02.5')).toBe(62_500);
    expect(parseTimecode('01:02.500')).toBe(62_500);
    expect(parseTimecode('62.5')).toBe(62_500);
    expect(parseTimecode('62,5')).toBe(62_500);
    expect(parseTimecode('1:2')).toBe(62_000);
  });

  it('rejects invalid inputs', () => {
    expect(parseTimecode('')).toBeNull();
    expect(parseTimecode('abc')).toBeNull();
    expect(parseTimecode('1:75')).toBeNull();
    expect(parseTimecode('-1')).toBeNull();
  });
});
