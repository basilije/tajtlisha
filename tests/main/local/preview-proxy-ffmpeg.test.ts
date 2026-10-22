/* @vitest-environment node */
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FfmpegService } from '../../../src/main/ffmpeg';
import { MediaService } from '../../../src/main/media';

const run = promisify(execFile);
const ffmpeg = new FfmpegService();
// Runs the real encoder. Skipped where ffmpeg is not installed.
const available = (await ffmpeg.getStatus()).available;

describe.skipIf(!available)('preview proxy with real ffmpeg', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'tajtlisha-proxy-'));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('encodes an odd-sized source (321x241) into an even-sized H.264 preview', async () => {
    const source = join(dir, 'odd.mp4');
    const preview = join(dir, 'preview.mp4');
    // mpeg4 accepts odd dimensions, so the source really is 321x241.
    await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=321x241:rate=10', '-t', '1', '-c:v', 'mpeg4', source]);

    await new MediaService(ffmpeg).createPreviewProxy(source, preview);

    const { stdout } = await ffmpeg.ffprobe(['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', preview]);
    expect(stdout.trim()).toBe('320,240');
  });
});
