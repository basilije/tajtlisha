/* @vitest-environment node */
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FfmpegService } from '../../../src/main/ffmpeg';
import { ProjectExportService } from '../../../src/main/export';
import { DEFAULT_SUBTITLE_STYLE } from '../../../src/shared/subtitle-geometry';

const ffmpegAvailable = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
const fontsDir = fileURLToPath(new URL('../../../resources/fonts', import.meta.url));

describe.skipIf(!ffmpegAvailable)('project export with real ffmpeg', () => {
  it('renders a trimmed, burned-in MP4 and SRT files that start at 00:00:00', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'tajtlisha-export-ffmpeg-'));
    const inputPath = join(folder, 'input clip.mp4');

    try {
      generateTestClip(inputPath);

      const result = await new ProjectExportService({ ffmpeg: new FfmpegService(), fontsDir }).exportProject({
        jobId: 'job-ffmpeg',
        inputPath,
        outputFolder: folder,
        baseName: 'clip',
        videoWidth: 360,
        videoHeight: 640,
        trim: { startMs: 1000, endMs: 3000 },
        captions: [
          { id: 'a', startMs: 1200, endMs: 2000, original: 'Hello there', translation: 'Zdravo' },
          { id: 'b', startMs: 2100, endMs: 2900, original: 'Second line\nwith a break', translation: 'Druga linija\nsa prelomom' }
        ],
        sourceLanguage: 'en',
        targetLanguage: 'sr-Latn',
        style: DEFAULT_SUBTITLE_STYLE,
        outputs: { originalSrt: true, translationSrt: true, video: 'translation' },
        overwritePolicy: 'ask'
      });

      expect(result.files.map((file) => file.kind)).toEqual(['original_srt', 'translation_srt', 'video']);
      const videoPath = result.files.find((file) => file.kind === 'video')?.path ?? '';
      expect(videoPath).toBe(join(folder, 'clip.subtitled.mp4'));
      expect((await stat(videoPath)).size).toBeGreaterThan(1000);

      const durationSeconds = Number(probe(videoPath, 'format=duration'));
      expect(durationSeconds).toBeGreaterThan(2.0 - 0.15);
      expect(durationSeconds).toBeLessThan(2.0 + 0.15);
      expect(probe(videoPath, 'stream=width,height', 'v:0')).toBe('360,640');

      for (const file of result.files.filter((entry) => entry.kind !== 'video')) {
        const firstStart = /^\d+\n(\d{2}:\d{2}:\d{2},\d{3}) -->/m.exec(await readFile(file.path, 'utf8'))?.[1];
        expect(firstStart).toBe('00:00:00,200');
      }

      const leftovers = (await readdir(folder)).filter((name) => name.startsWith('.tajtlisha-export-'));
      expect(leftovers).toEqual([]);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }, 120_000);
});

function generateTestClip(outputPath: string): void {
  const result = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=360x640:rate=25:duration=4',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=4',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      outputPath
    ],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(`Could not generate the test clip: ${result.stderr}`);
  }
}

function probe(path: string, entries: string, streamSelector?: string): string {
  const args = ['-v', 'error', '-show_entries', entries, '-of', 'default=noprint_wrappers=1:nokey=1'];
  if (streamSelector) args.push('-select_streams', streamSelector);
  const result = spawnSync('ffprobe', [...args, path], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`ffprobe failed: ${result.stderr}`);
  }
  return result.stdout.trim().split(/\r?\n/).join(',');
}
