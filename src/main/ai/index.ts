import { MemoryCredentialStore } from '../credentials/memory-credential-store';
import type { CredentialStore } from '../credentials/credential-store';
import { AiProviderRegistry, createProviders } from './provider-registry';

export function createDefaultAiProviderRegistry(credentialStore: CredentialStore = new MemoryCredentialStore()): AiProviderRegistry {
  return new AiProviderRegistry(createProviders(credentialStore), credentialStore);
}

export { AiProviderRegistry } from './provider-registry';
export { SubtitleWorkflowService } from './subtitle-workflow';
export type {
  AiProvider,
  AiProviderContext,
  ProviderAudioFormat,
  ProviderPolishMode,
  ProviderPolishRequest,
  ProviderTextItem,
  ProviderTimedText,
  ProviderTranscribeRequest,
  ProviderTranscribeResult,
  ProviderTranslateRequest,
  ProviderDefinition
} from './provider';
