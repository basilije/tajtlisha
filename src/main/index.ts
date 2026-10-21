import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell } from 'electron';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDefaultAiProviderRegistry, SubtitleWorkflowService } from './ai';
import { SecureCredentialStore } from './credentials/secure-credential-store';
import { ProjectExportService } from './export';
import { FfmpegService } from './ffmpeg';
import { registerAiIpc } from './ipc/ai.ipc';
import { registerExportIpc } from './ipc/export.ipc';
import { registerJobsIpc } from './ipc/jobs.ipc';
import { registerMediaIpc } from './ipc/media.ipc';
import { registerProjectIpc } from './ipc/project.ipc';
import { registerSettingsIpc } from './ipc/settings.ipc';
import type { DesktopDialogs, DesktopShell, MessageBoxRequest, OpenDialogRequest } from './ipc/types';
import { registerWorkflowIpc } from './ipc/workflow.ipc';
import { mainStringsFor, resolveMainLanguage } from './i18n';
import { JobRegistry } from './jobs/job-registry';
import { MediaService } from './media';
import { createLocalMediaProtocol } from './media/local-media-protocol';
import { PreviewProxyCache } from './project/preview-proxy-cache';
import { ProjectStore } from './project/project-store';
import { bundledFontsDir } from './resources-path';
import { SettingsStore } from './settings';

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const localMediaProtocol = createLocalMediaProtocol();

type AppServices = {
  jobs: JobRegistry;
  projectStore: ProjectStore;
  previewProxies: PreviewProxyCache;
};

let services: AppServices | undefined;

/** Only the app's own pages may be navigated to; anything else stays out of the window. */
const appOrigin = isDev && process.env.ELECTRON_RENDERER_URL ? new URL(process.env.ELECTRON_RENDERER_URL).origin : undefined;

function isAppUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return appOrigin ? parsed.origin === appOrigin : parsed.protocol === 'file:';
  } catch {
    return false;
  }
}

function createWindow(appServices: AppServices): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 700,
    title: 'Tajtlisha',
    backgroundColor: '#121517',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Jobs belong to the window that started them, so they stop when it closes.
  const windowId = mainWindow.webContents.id;
  mainWindow.webContents.on('destroyed', () => appServices.jobs.cancelAllFor(windowId));

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
    }
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await localMediaProtocol.register();

  const settingsStore = new SettingsStore();
  const credentialStore = new SecureCredentialStore({
    filePath: join(app.getPath('userData'), 'credentials.json'),
    crypto: safeStorage
  });
  const aiRegistry = createDefaultAiProviderRegistry(credentialStore);
  const ffmpeg = new FfmpegService();
  const mediaService = new MediaService(ffmpeg);
  const exporter = new ProjectExportService({ fontsDir: bundledFontsDir() });
  const workflow = new SubtitleWorkflowService(aiRegistry, mediaService, ffmpeg);
  const jobs = new JobRegistry();
  const projectStore = new ProjectStore({
    dir: join(app.getPath('userData'), 'projects'),
    createVideoUrl: localMediaProtocol.createVideoUrl
  });
  const previewProxies = new PreviewProxyCache(tmpdir());
  services = { jobs, projectStore, previewProxies };

  // Strings for native dialogs follow the UI language from settings.
  const strings = async () => mainStringsFor(resolveMainLanguage((await settingsStore.get()).uiLanguage, app.getLocale()));
  const dialogs: DesktopDialogs = {
    showOpenDialog: (request: OpenDialogRequest) => dialog.showOpenDialog(request),
    showMessageBox: (request: MessageBoxRequest) => dialog.showMessageBox(request)
  };
  const desktopShell: DesktopShell = {
    showItemInFolder: (fullPath: string) => shell.showItemInFolder(fullPath)
  };

  registerSettingsIpc({ ipc: ipcMain, settingsStore });
  registerAiIpc({ ipc: ipcMain, registry: aiRegistry });
  registerProjectIpc({
    ipc: ipcMain,
    jobs,
    dialogs,
    mediaService,
    projectStore,
    previewProxies,
    exporter,
    createVideoUrl: localMediaProtocol.createVideoUrl,
    strings
  });
  registerWorkflowIpc({ ipc: ipcMain, jobs, workflow });
  registerJobsIpc({ ipc: ipcMain, jobs });
  registerExportIpc({ ipc: ipcMain, jobs, exporter, dialogs, shell: desktopShell, strings });
  registerMediaIpc({ ipc: ipcMain, ffmpeg });

  // Updater: wired by build/packaging-autoupdate. Its IPC (updates:* and app:getInfo) is registered there.

  createWindow({ jobs, projectStore, previewProxies });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow({ jobs, projectStore, previewProxies });
    }
  });
});

// Quit waits for pending project writes and removes preview files. The first
// quit is held back and repeated once that work is done.
let quitPrepared = false;
app.on('before-quit', (event) => {
  if (quitPrepared || !services) return;
  event.preventDefault();
  quitPrepared = true;
  const { projectStore, previewProxies } = services;
  void Promise.allSettled([projectStore.flush(), previewProxies.cleanup()]).finally(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
