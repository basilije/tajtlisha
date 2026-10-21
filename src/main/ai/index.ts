import { MemoryCredentialStore } from '../credentials/memory-credential-store';
import type { CredentialStore } from '../credentials/credential-store';
import { openAiProviderDefinition } from './openai-provider';
import { openRouterProviderDefinition } from './openrouter-provider';
import { AiProviderRegistry } from './provider-registry';

export function createDefaultAiProviderRegistry(credentialStore: CredentialStore = new MemoryCredentialStore()): AiProviderRegistry {
  return new AiProviderRegistry(
    [openAiProviderDefinition, openRouterProviderDefinition],
    credentialStore
  );
}

export { AiProviderRegistry } from './provider-registry';
export { SubtitleWorkflowService } from './subtitle-workflow';
export type { AiProvider, AiProviderContext, ProviderDefinition } from './provider';
