import { app } from 'electron';
import { IPC_CHANNELS, type QuitReadyResult } from '../../shared/types/ipc';
import type { QuitCoordinator } from '../quit-coordinator';
import { requireString } from './validation';
import type { IpcRegistrar } from './types';

export type AppIpcDeps = {
  ipc: IpcRegistrar;
  quit: Pick<QuitCoordinator, 'acknowledge'>;
};

export function registerAppIpc({ ipc, quit }: AppIpcDeps): void {
  ipc.handle(IPC_CHANNELS.appGetInfo, () => ({
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged
  }));

  // Answer to app:prepareQuit. Only the window that was asked can answer for itself.
  ipc.handle(IPC_CHANNELS.appQuitReady, (event, requestId: unknown, result: unknown) => {
    quit.acknowledge(requireString(requestId, 'requestId'), event.sender.id, quitResultFrom(result));
  });
}

/** Anything but an explicit `saved: true` counts as unsaved, so a malformed answer never quits silently. */
function quitResultFrom(value: unknown): QuitReadyResult {
  const record: Record<string, unknown> = typeof value === 'object' && value !== null ? { ...value } : {};
  return {
    saved: record.saved === true,
    ...(typeof record.detail === 'string' ? { detail: record.detail } : {})
  };
}
