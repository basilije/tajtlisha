import type { FfmpegStatus } from '../../shared/types/media';
import { resolveFfmpegPaths } from './paths';
import { runProcess } from './process';

export type FfmpegRunOptions = {
  signal?: AbortSignal;
  /**
   * Receives the encoded output position in milliseconds. When set, the args
   * are prefixed with `-progress pipe:1 -nostats`.
   */
  onProgress?: (outTimeMs: number) => void;
};

export type FfmpegServiceOptions = {
  ffmpegPath?: string;
  ffprobePath?: string;
};

export class FfmpegService {
  readonly ffmpegPath: string;
  readonly ffprobePath: string;

  constructor(options: FfmpegServiceOptions = {}) {
    // Explicit options win; otherwise env override, then bundled binaries, then PATH (see paths.ts).
    const resolved = resolveFfmpegPaths();
    this.ffmpegPath = options.ffmpegPath ?? resolved.ffmpegPath;
    this.ffprobePath = options.ffprobePath ?? resolved.ffprobePath;
  }

  async getStatus(): Promise<FfmpegStatus> {
    try {
      const result = await runProcess(this.ffmpegPath, ['-version'], { timeoutMs: 3000 });
      const firstLine = result.stdout.split(/\r?\n/)[0]?.trim();
      return {
        available: true,
        path: this.ffmpegPath,
        version: firstLine,
        message: firstLine ? undefined : 'ffmpeg responded without version output.'
      };
    } catch (error) {
      return {
        available: false,
        path: this.ffmpegPath,
        message: error instanceof Error ? error.message : 'ffmpeg is not available.'
      };
    }
  }

  run(args: string[], options: FfmpegRunOptions = {}): Promise<{ stdout: string; stderr: string }> {
    const { signal, onProgress } = options;
    if (!onProgress) {
      return runProcess(this.ffmpegPath, args, { signal });
    }

    return runProcess(this.ffmpegPath, ['-progress', 'pipe:1', '-nostats', ...args], {
      signal,
      onStdoutLine: (line) => {
        // ffmpeg reports out_time_us (and the misnamed out_time_ms, also in microseconds).
        const match = /^out_time_us=(\d+)$/.exec(line);
        if (match) onProgress(Math.round(Number(match[1]) / 1000));
      }
    });
  }

  ffprobe(args: string[], options: { signal?: AbortSignal } = {}): Promise<{ stdout: string; stderr: string }> {
    return runProcess(this.ffprobePath, args, options);
  }
}
