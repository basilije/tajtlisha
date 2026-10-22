import { IPC_CHANNELS } from '../../shared/types/ipc';
import type { FfmpegStatus } from '../../shared/types/media';
import { checkFfmpegCapabilities, type FfmpegService } from '../ffmpeg';
import type { IpcRegistrar } from './types';

export type MediaIpcDeps = {
  ipc: IpcRegistrar;
  ffmpeg: Pick<FfmpegService, 'getStatus' | 'ffmpegPath' | 'ffprobePath'>;
};

export function registerMediaIpc({ ipc, ffmpeg }: MediaIpcDeps): void {
  ipc.handle(IPC_CHANNELS.mediaGetFfmpegStatus, () => getFfmpegStatus(ffmpeg));
}

/** Available only when ffmpeg runs and every capability the export needs is present. */
export async function getFfmpegStatus(ffmpeg: MediaIpcDeps['ffmpeg']): Promise<FfmpegStatus> {
  const [status, capabilities] = await Promise.all([ffmpeg.getStatus(), checkFfmpegCapabilities(ffmpeg)]);
  const { missing, ...flags } = capabilities;
  const available = flags.ffmpeg && missing.length === 0;

  return {
    available,
    path: status.path,
    version: status.version,
    message: available ? undefined : missing.length > 0 ? `Missing: ${missing.join(', ')}.` : status.message,
    missing,
    capabilities: {
      ffprobe: flags.ffprobe,
      assFilter: flags.assFilter,
      libx264: flags.libx264,
      aac: flags.aac,
      mp3: flags.mp3
    }
  };
}
