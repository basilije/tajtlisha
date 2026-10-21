import type { FfmpegStatus } from '../../shared/types/media';
import { runProcess } from './process';

export type FfmpegServiceOptions = {
  ffmpegPath?: string;
  ffprobePath?: string;
};

export class FfmpegService {
  readonly ffmpegPath: string;
  readonly ffprobePath: string;

  constructor(options: FfmpegServiceOptions = {}) {
    this.ffmpegPath = options.ffmpegPath ?? 'ffmpeg';
    this.ffprobePath = options.ffprobePath ?? 'ffprobe';
  }

  async getStatus(): Promise<FfmpegStatus> {
    try {
      const result = await runProcess(this.ffmpegPath, ['-version'], { timeoutMs: 3000 });
      const firstLine = result.stdout.split('\n')[0]?.trim();
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

  run(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return runProcess(this.ffmpegPath, args);
  }

  ffprobe(args: string[]): Promise<{ stdout: string; stderr: string }> {
    return runProcess(this.ffprobePath, args);
  }
}
