import { ipcMain, type IpcMain } from 'electron';
import { SettingsStore } from '../settings';

export function registerSettingsIpc(ipc = ipcMain as IpcMain, settingsStore = new SettingsStore()): void {
  ipc.handle('settings:get', () => settingsStore.get());
  ipc.handle('settings:update', (_event, patch) => settingsStore.update(patch));
  ipc.handle('settings:reset', () => settingsStore.reset());
}
