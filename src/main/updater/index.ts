import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateState } from '../../shared/types/updates';
import { createUpdateService, isUpdateSupported, type UpdateService } from './update-service';

export * from './update-service';

/**
 * Production wiring: the real electron-updater singleton. Imported only from the
 * main process entry, so unit tests of the service never load electron.
 */
export function createDefaultUpdateService(broadcast: (state: UpdateState) => void): UpdateService {
  return createUpdateService({
    autoUpdater,
    appVersion: app.getVersion(),
    isSupported: isUpdateSupported({ isPackaged: app.isPackaged, platform: process.platform, env: process.env }),
    broadcast
  });
}
