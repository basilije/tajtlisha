import fs from 'node:fs';
import path from 'node:path';

export type FfmpegPathSource = 'env' | 'bundled' | 'system';

export type FfmpegPaths = {
  ffmpegPath: string;
  ffprobePath: string;
  source: FfmpegPathSource;
};

export type ResolveFfmpegPathsOptions = {
  /** Electron's process.resourcesPath in packaged builds; undefined in plain Node (tests, dev). */
  resourcesPath?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  exists?: (file: string) => boolean;
};

export const FFMPEG_PATH_ENV = 'TAJTLISHA_FFMPEG_PATH';
export const FFPROBE_PATH_ENV = 'TAJTLISHA_FFPROBE_PATH';

/**
 * Picks the ffmpeg/ffprobe pair to run, in this order:
 * 1. Both TAJTLISHA_FFMPEG_PATH and TAJTLISHA_FFPROBE_PATH (setting only one is ignored).
 * 2. The bundled pair in `<resourcesPath>/ffmpeg/`, when both files exist.
 * 3. `ffmpeg` and `ffprobe` from PATH.
 *
 * Must not import Electron: unit tests run in plain Node.
 */
export function resolveFfmpegPaths({
  resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath,
  platform = process.platform,
  env = process.env,
  exists = fs.existsSync
}: ResolveFfmpegPathsOptions = {}): FfmpegPaths {
  const envFfmpeg = env[FFMPEG_PATH_ENV]?.trim();
  const envFfprobe = env[FFPROBE_PATH_ENV]?.trim();
  if (envFfmpeg && envFfprobe) {
    return { ffmpegPath: envFfmpeg, ffprobePath: envFfprobe, source: 'env' };
  }

  const suffix = platform === 'win32' ? '.exe' : '';
  if (resourcesPath) {
    const bundledDir = path.join(resourcesPath, 'ffmpeg');
    const ffmpegPath = path.join(bundledDir, `ffmpeg${suffix}`);
    const ffprobePath = path.join(bundledDir, `ffprobe${suffix}`);
    if (exists(ffmpegPath) && exists(ffprobePath)) {
      return { ffmpegPath, ffprobePath, source: 'bundled' };
    }
  }

  return { ffmpegPath: `ffmpeg${suffix}`, ffprobePath: `ffprobe${suffix}`, source: 'system' };
}
