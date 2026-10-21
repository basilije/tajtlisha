import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type {
  AiProviderCapabilities,
  AiProviderId,
  ConnectProviderInput,
  GenerateSubtitlesRequest,
  SubtitlePolishRequest,
  TranscriptionRequest,
  TranslationRequest
} from '../../shared/types/ai';
import { createDefaultAiProviderRegistry, SubtitleWorkflowService, type AiProviderRegistry } from '../ai';

export const aiIpcChannels = {
  listProviders: 'ai:listProviders',
  getProviderStatus: 'ai:getProviderStatus',
  connectProvider: 'ai:connectProvider',
  disconnectProvider: 'ai:disconnectProvider',
  testConnection: 'ai:testConnection',
  listModels: 'ai:listModels',
  transcribe: 'ai:transcribe',
  translate: 'ai:translate',
  polishSubtitles: 'ai:polishSubtitles',
  generateSubtitles: 'ai:generateSubtitles'
} as const;

export function registerAiIpc(
  registry: AiProviderRegistry = createDefaultAiProviderRegistry(),
  subtitleWorkflowService = new SubtitleWorkflowService(registry)
): void {
  ipcMain.handle(aiIpcChannels.listProviders, () => registry.listProviders());

  ipcMain.handle(aiIpcChannels.getProviderStatus, (_event: IpcMainInvokeEvent, providerId: AiProviderId) =>
    registry.getProviderStatus(providerId)
  );

  ipcMain.handle(aiIpcChannels.connectProvider, (_event: IpcMainInvokeEvent, input: ConnectProviderInput) =>
    registry.connectProvider(input)
  );

  ipcMain.handle(aiIpcChannels.disconnectProvider, (_event: IpcMainInvokeEvent, providerId: AiProviderId) =>
    registry.disconnectProvider(providerId)
  );

  ipcMain.handle(aiIpcChannels.testConnection, (_event: IpcMainInvokeEvent, providerId: AiProviderId) =>
    registry.testConnection(providerId)
  );

  ipcMain.handle(
    aiIpcChannels.listModels,
    (_event: IpcMainInvokeEvent, providerId: AiProviderId, capability: keyof AiProviderCapabilities) =>
      registry.listModels(providerId, capability)
  );

  ipcMain.handle(aiIpcChannels.transcribe, (_event: IpcMainInvokeEvent, providerId: AiProviderId, request: TranscriptionRequest) =>
    registry.transcribe(providerId, request)
  );

  ipcMain.handle(aiIpcChannels.translate, (_event: IpcMainInvokeEvent, providerId: AiProviderId, request: TranslationRequest) =>
    registry.translate(providerId, request)
  );

  ipcMain.handle(
    aiIpcChannels.polishSubtitles,
    (_event: IpcMainInvokeEvent, providerId: AiProviderId, request: SubtitlePolishRequest) =>
      registry.polishSubtitles(providerId, request)
  );

  ipcMain.handle(aiIpcChannels.generateSubtitles, (_event: IpcMainInvokeEvent, request: GenerateSubtitlesRequest) =>
    subtitleWorkflowService.generateSubtitles(request)
  );
}
