import { IPC_CHANNELS } from '../../shared/types/ipc';
import type { AppSettings } from '../../shared/types/settings';
import type { SettingsStore } from '../settings';
import { requireRecord } from './validation';
import type { IpcRegistrar } from './types';

export type SettingsIpcDeps = {
  ipc: IpcRegistrar;
  settingsStore: Pick<SettingsStore, 'get' | 'update' | 'reset'>;
};

export function registerSettingsIpc({ ipc, settingsStore }: SettingsIpcDeps): void {
  ipc.handle(IPC_CHANNELS.settingsGet, () => settingsStore.get());
  ipc.handle(IPC_CHANNELS.settingsUpdate, (_event, patch: unknown) =>
    settingsStore.update(requireRecord(patch, 'patch') as Partial<AppSettings>)
  );
  ipc.handle(IPC_CHANNELS.settingsReset, () => settingsStore.reset());
}
