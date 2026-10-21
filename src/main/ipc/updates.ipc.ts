import { BrowserWindow, ipcMain, type IpcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/types/ipc';
import type { UpdateState } from '../../shared/types/updates';
import type { UpdateService } from '../updater/update-service';

export function registerUpdatesIpc(service: UpdateService, ipc = ipcMain as IpcMain): void {
  ipc.handle(IPC_CHANNELS.updatesGetState, () => service.getState());
  ipc.handle(IPC_CHANNELS.updatesCheck, () => service.check());
  ipc.handle(IPC_CHANNELS.updatesDownload, () => service.download());
  ipc.handle(IPC_CHANNELS.updatesInstall, () => service.install());
}

/** Sends every state change to all open windows (renderer subscribes via `updates.onState`). */
export function createBroadcast(getWindows: () => BrowserWindow[] = () => BrowserWindow.getAllWindows()): (state: UpdateState) => void {
  return (state) => {
    for (const window of getWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.updatesState, state);
      }
    }
  };
}
