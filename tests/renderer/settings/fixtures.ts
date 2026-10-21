import type { FfmpegStatus } from '../../../src/shared/types/media';
import type { UpdateState } from '../../../src/shared/types/updates';

/** Installs a partial preload API on window; tests only fake what the section reads. */
export function installFakeApi(api: Record<string, unknown>): void {
  window.tajtlisha = api as unknown as typeof window.tajtlisha;
}

export function removeFakeApi(): void {
  Reflect.deleteProperty(window, 'tajtlisha');
}

export function updateState(overrides: Partial<UpdateState> & Pick<UpdateState, 'status'>): UpdateState {
  return { currentVersion: '0.2.0', ...overrides };
}

export const fullFfmpegStatus: FfmpegStatus = {
  available: true,
  path: '/usr/bin/ffmpeg',
  version: 'ffmpeg version 6.1',
  capabilities: { ffprobe: true, assFilter: true, libx264: true, aac: true, mp3: true }
};
