import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC_CHANNELS as C, type TajtlishaApi } from '../shared/types/ipc';
import type { JobProgressEvent } from '../shared/types/jobs';
import type { UpdateState } from '../shared/types/updates';

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api: TajtlishaApi = {
  settings: {
    get: () => ipcRenderer.invoke(C.settingsGet),
    update: (patch) => ipcRenderer.invoke(C.settingsUpdate, patch),
    reset: () => ipcRenderer.invoke(C.settingsReset)
  },
  ai: {
    listProviders: () => ipcRenderer.invoke(C.aiListProviders),
    getProviderStatus: (providerId) => ipcRenderer.invoke(C.aiGetProviderStatus, providerId),
    connectProvider: (input) => ipcRenderer.invoke(C.aiConnectProvider, input),
    disconnectProvider: (providerId) => ipcRenderer.invoke(C.aiDisconnectProvider, providerId),
    testConnection: (providerId) => ipcRenderer.invoke(C.aiTestConnection, providerId),
    listModels: (providerId, capability) => ipcRenderer.invoke(C.aiListModels, providerId, capability)
  },
  project: {
    selectVideo: () => ipcRenderer.invoke(C.projectSelectVideo),
    loadLast: () => ipcRenderer.invoke(C.projectLoadLast),
    save: (project) => ipcRenderer.invoke(C.projectSave, project),
    createPreviewProxy: (request) => ipcRenderer.invoke(C.projectCreatePreviewProxy, request),
    renderPreviewFrame: (request) => ipcRenderer.invoke(C.projectRenderPreviewFrame, request)
  },
  workflow: {
    transcribe: (request) => ipcRenderer.invoke(C.workflowTranscribe, request),
    translate: (request) => ipcRenderer.invoke(C.workflowTranslate, request)
  },
  jobs: {
    cancel: (jobId) => ipcRenderer.invoke(C.jobsCancel, jobId),
    onProgress: (listener) => subscribe<JobProgressEvent>(C.jobsProgress, listener)
  },
  export: {
    selectOutputFolder: () => ipcRenderer.invoke(C.exportSelectOutputFolder),
    exportProject: (request) => ipcRenderer.invoke(C.exportProject, request),
    showInFolder: (path) => ipcRenderer.invoke(C.exportShowInFolder, path)
  },
  media: {
    getFfmpegStatus: () => ipcRenderer.invoke(C.mediaGetFfmpegStatus)
  },
  updates: {
    getState: () => ipcRenderer.invoke(C.updatesGetState),
    check: () => ipcRenderer.invoke(C.updatesCheck),
    download: () => ipcRenderer.invoke(C.updatesDownload),
    install: () => ipcRenderer.invoke(C.updatesInstall),
    onState: (listener) => subscribe<UpdateState>(C.updatesState, listener)
  },
  app: {
    getInfo: () => ipcRenderer.invoke(C.appGetInfo)
  }
};

contextBridge.exposeInMainWorld('tajtlisha', api);
