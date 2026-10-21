import { app, BrowserWindow, Menu, safeStorage } from 'electron';
import { join } from 'node:path';
import { createDefaultAiProviderRegistry } from './ai';
import { SecureCredentialStore } from './credentials/secure-credential-store';
import { registerAiIpc } from './ipc/ai.ipc';
import { registerExportIpc } from './ipc/export.ipc';
import { registerMediaIpc } from './ipc/media.ipc';
import { registerSettingsIpc } from './ipc/settings.ipc';
import { createLocalMediaProtocol } from './media/local-media-protocol';

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const localMediaProtocol = createLocalMediaProtocol();

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: 'Tajtlisha',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await localMediaProtocol.register();
  const credentialStore = new SecureCredentialStore({
    filePath: join(app.getPath('userData'), 'credentials.json'),
    crypto: safeStorage
  });
  const aiRegistry = createDefaultAiProviderRegistry(credentialStore);

  registerSettingsIpc();
  registerAiIpc(aiRegistry);
  registerMediaIpc({ createVideoUrl: localMediaProtocol.createVideoUrl });
  registerExportIpc();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
