import { contextBridge, ipcRenderer } from 'electron';
import type { TajtlishaApi } from '../shared/types/ipc';

const api: TajtlishaApi = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch),
    reset: () => ipcRenderer.invoke('settings:reset')
  },
  ai: {
    listProviders: () => ipcRenderer.invoke('ai:listProviders'),
    getProviderStatus: (providerId) => ipcRenderer.invoke('ai:getProviderStatus', providerId),
    connectProvider: (input) => ipcRenderer.invoke('ai:connectProvider', input),
    disconnectProvider: (providerId) => ipcRenderer.invoke('ai:disconnectProvider', providerId),
    testConnection: (providerId) => ipcRenderer.invoke('ai:testConnection', providerId),
    listModels: (providerId, capability) => ipcRenderer.invoke('ai:listModels', providerId, capability),
    transcribe: (providerId, request) => ipcRenderer.invoke('ai:transcribe', providerId, request),
    translate: (providerId, request) => ipcRenderer.invoke('ai:translate', providerId, request),
    polishSubtitles: (providerId, request) => ipcRenderer.invoke('ai:polishSubtitles', providerId, request),
    generateSubtitles: (request) => ipcRenderer.invoke('ai:generateSubtitles', request)
  },
  media: {
    selectVideo: () => ipcRenderer.invoke('media:selectVideo'),
    createPreviewProxy: (input) => ipcRenderer.invoke('media:createPreviewProxy', input),
    getFfmpegStatus: () => ipcRenderer.invoke('media:getFfmpegStatus'),
    probe: (input) => ipcRenderer.invoke('media:probe', input),
    trim: (input) => ipcRenderer.invoke('media:trim', input),
    extractAudio: (input) => ipcRenderer.invoke('media:extractAudio', input)
  },
  export: {
    selectOutputFolder: () => ipcRenderer.invoke('export:selectOutputFolder'),
    writeSrt: (input) => ipcRenderer.invoke('export:writeSrt', input),
    burnSubtitles: (input) => ipcRenderer.invoke('export:burnSubtitles', input),
    exportProject: (input) => ipcRenderer.invoke('export:project', input)
  }
};

contextBridge.exposeInMainWorld('tajtlisha', api);
