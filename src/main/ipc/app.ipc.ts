import { app, ipcMain, type IpcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/types/ipc';

export function registerAppIpc(ipc = ipcMain as IpcMain): void {
  ipc.handle(IPC_CHANNELS.appGetInfo, () => ({
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged
  }));
}
