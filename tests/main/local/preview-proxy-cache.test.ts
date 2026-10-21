/* @vitest-environment node */
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PreviewProxyCache } from '../../../src/main/project/preview-proxy-cache';

let dir: string;
let counter: number;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tajtlisha-cache-'));
  counter = 0;
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function createCache(): PreviewProxyCache {
  return new PreviewProxyCache(dir, () => `preview-${++counter}.mp4`);
}

/** Writes a real file so cleanup and replacement can be observed on disk. */
const transcode = (outputPath: string) => writeFile(outputPath, 'preview');

describe('PreviewProxyCache', () => {
  it('reuses the preview for the same path and fingerprint', async () => {
    const cache = createCache();
    const create = vi.fn(transcode);

    const first = await cache.get('/videos/a.mp4', { size: 10, mtimeMs: 1 }, create);
    const second = await cache.get('/videos/a.mp4', { size: 10, mtimeMs: 1 }, create);

    expect(second).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('transcodes again when the file was replaced, and removes the old preview', async () => {
    const cache = createCache();
    const oldPreview = await cache.get('/videos/a.mp4', { size: 10, mtimeMs: 1 }, transcode);

    const newPreview = await cache.get('/videos/a.mp4', { size: 10, mtimeMs: 2 }, transcode);

    expect(newPreview).not.toBe(oldPreview);
    await vi.waitFor(async () => {
      expect(await readdir(dir)).toEqual([join(newPreview).split('/').pop()]);
    });
  });

  it('keeps separate previews for separate paths', async () => {
    const cache = createCache();

    const a = await cache.get('/videos/a.mp4', { size: 1, mtimeMs: 1 }, transcode);
    const b = await cache.get('/videos/b.mp4', { size: 1, mtimeMs: 1 }, transcode);

    expect(a).not.toBe(b);
  });

  it('shares one transcode between concurrent requests for the same fingerprint', async () => {
    const cache = createCache();
    const create = vi.fn(transcode);

    const [a, b] = await Promise.all([
      cache.get('/videos/a.mp4', { size: 1, mtimeMs: 1 }, create),
      cache.get('/videos/a.mp4', { size: 1, mtimeMs: 1 }, create)
    ]);

    expect(a).toBe(b);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('leaves nothing behind when a transcode fails, and retries on the next request', async () => {
    const cache = createCache();
    const failing = async (outputPath: string) => {
      await writeFile(outputPath, 'partial');
      throw new Error('ffmpeg exited with code 1');
    };

    await expect(cache.get('/videos/a.mp4', { size: 1, mtimeMs: 1 }, failing)).rejects.toThrow('ffmpeg exited');
    expect(await readdir(dir)).toEqual([]);

    const retry = vi.fn(transcode);
    await cache.get('/videos/a.mp4', { size: 1, mtimeMs: 1 }, retry);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('cleanup deletes every preview made this session', async () => {
    const cache = createCache();
    await cache.get('/videos/a.mp4', { size: 1, mtimeMs: 1 }, transcode);
    await cache.get('/videos/b.mp4', { size: 1, mtimeMs: 1 }, transcode);

    await cache.cleanup();

    expect(await readdir(dir)).toEqual([]);
  });
});
