import { test, expect, _electron as electron } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { join } from 'node:path';

type RendererGlobal = typeof globalThis & {
  tajtlisha: {
    media: {
      createPreviewProxy(input: { inputPath: string }): Promise<{ fileUrl: string }>;
    };
  };
};

test('launches Tajtlisha and navigates between Editor and Settings', async () => {
  const mainEntry = resolve(process.cwd(), 'out/main/index.js');
  test.skip(!existsSync(mainEntry), 'Run pnpm build before pnpm test:e2e.');

  const app = await electron.launch({ args: [mainEntry] });

  const window = await app.firstWindow();
  await expect
    .poll(() =>
      window.evaluate(
        () => typeof (globalThis as { tajtlisha?: { media?: { selectVideo?: unknown } } }).tajtlisha?.media?.selectVideo
      )
    )
    .toBe('function');
  await expect(window.getByRole('heading', { name: 'Editor' })).toBeVisible();
  expect(
    await window.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  ).toContain('tajtlisha-media:');
  await window.getByRole('button', { name: 'Settings' }).click();
  await expect(window.getByRole('heading', { name: 'Settings' })).toBeVisible();

  await app.close();
});

test('plays an ffmpeg preview proxy through the local media protocol', async () => {
  const mainEntry = resolve(process.cwd(), 'out/main/index.js');
  test.skip(!existsSync(mainEntry), 'Run pnpm build before pnpm test:e2e.');

  const tempFolder = mkdtempSync(join(tmpdir(), 'tajtlisha-e2e-media-'));
  const inputPath = join(tempFolder, 'source.mp4');
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=24',
    '-t',
    '0.5',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    inputPath
  ]);

  const app = await electron.launch({ args: [mainEntry] });
  try {
    const page = await app.firstWindow();
    const preview = await page.evaluate(
      (sourcePath) =>
        (globalThis as RendererGlobal).tajtlisha.media.createPreviewProxy({ inputPath: sourcePath }),
      inputPath
    );
    const playback = await page.evaluate(
      (fileUrl) =>
        new Promise<{ code?: number; duration?: number; status: 'error' | 'loadedmetadata' | 'timeout' }>((resolvePlayback) => {
          const video = document.createElement('video');
          video.preload = 'metadata';
          video.onloadedmetadata = () => resolvePlayback({ status: 'loadedmetadata', duration: video.duration });
          video.onerror = () => resolvePlayback({ status: 'error', code: video.error?.code });
          video.src = fileUrl;
          document.body.append(video);
          globalThis.setTimeout(() => resolvePlayback({ status: 'timeout' }), 10000);
        }),
      preview.fileUrl
    );

    expect(playback.status).toBe('loadedmetadata');
    expect(playback.duration).toBeGreaterThan(0);
  } finally {
    await app.close();
    rmSync(tempFolder, { force: true, recursive: true });
  }
});
