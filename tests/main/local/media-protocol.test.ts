/* @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { MediaTokenMap } from '../../../src/main/media/media-token-map';

function sequentialTokens() {
  let next = 0;
  return () => `token-${++next}`;
}

describe('MediaTokenMap', () => {
  it('gives the same token to the same path and different tokens to different paths', () => {
    const tokens = new MediaTokenMap(sequentialTokens());

    const first = tokens.tokenFor('/videos/a.mp4');
    expect(tokens.tokenFor('/videos/a.mp4')).toBe(first);
    expect(tokens.tokenFor('/videos/b.mp4')).not.toBe(first);
    expect(tokens.size).toBe(2);
  });

  it('serves several files at once', () => {
    const tokens = new MediaTokenMap(sequentialTokens());
    const source = tokens.tokenFor('/videos/source.mov');
    const preview = tokens.tokenFor('/tmp/tajtlisha-preview-1.mp4');

    expect(tokens.pathFor(source)).toBe('/videos/source.mov');
    expect(tokens.pathFor(preview)).toBe('/tmp/tajtlisha-preview-1.mp4');
  });

  it('returns undefined for unknown tokens', () => {
    const tokens = new MediaTokenMap(sequentialTokens());

    expect(tokens.pathFor('nope')).toBeUndefined();
  });

  it('revoke invalidates the old token and a re-import gets a new one', () => {
    const tokens = new MediaTokenMap(sequentialTokens());
    const old = tokens.tokenFor('/videos/a.mp4');

    tokens.revoke('/videos/a.mp4');
    tokens.revoke('/videos/never-added.mp4');

    expect(tokens.pathFor(old)).toBeUndefined();
    expect(tokens.size).toBe(0);
    const fresh = tokens.tokenFor('/videos/a.mp4');
    expect(fresh).not.toBe(old);
    expect(tokens.pathFor(fresh)).toBe('/videos/a.mp4');
  });

  it('uses random UUID tokens by default', () => {
    const tokens = new MediaTokenMap();
    const token = tokens.tokenFor('/videos/a.mp4');

    expect(token).toMatch(/^[0-9a-f-]{36}$/);
  });
});
