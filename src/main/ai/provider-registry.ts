import type {
  AiProviderCapabilities,
  AiProviderId,
  ConnectProviderInput,
  ProviderModelDescriptor,
  ProviderStatus,
  ProviderSummary,
  SubtitlePolishRequest,
  TestConnectionResult,
  TranscriptionRequest,
  TranscriptionResult,
  TranslationRequest
} from '../../shared/types/ai';
import type { SubtitleTrack } from '../../shared/types/subtitles';
import type { CredentialStore } from '../credentials/credential-store';
import { OpenAiProvider } from './openai-provider';
import { OpenRouterProvider } from './openrouter-provider';
import { PlaceholderAiProvider, type AiProvider, type ProviderDefinition } from './provider';

export class AiProviderRegistry {
  private readonly providers = new Map<AiProviderId, AiProvider>();
  private readonly credentialStore: CredentialStore;

  constructor(definitions: ProviderDefinition[], credentialStore: CredentialStore) {
    this.credentialStore = credentialStore;

    for (const definition of definitions) {
      const provider =
        definition.id === 'openai'
          ? new OpenAiProvider({ credentialStore })
          : definition.id === 'openrouter'
            ? new OpenRouterProvider({ credentialStore })
          : new PlaceholderAiProvider(definition, { credentialStore });
      this.providers.set(definition.id, provider);
    }
  }

  async listProviders(): Promise<ProviderSummary[]> {
    return Array.from(this.providers.values()).map((provider) => this.toSummary(provider));
  }

  async getProviderStatus(providerId: AiProviderId): Promise<ProviderStatus> {
    const provider = this.requireProvider(providerId);
    const credential = await this.credentialStore.get(providerId);

    return {
      ...this.toSummary(provider),
      connected: Boolean(credential),
      activeAuthMode: credential?.authMode,
      maskedCredential: credential ? await this.maskedCredential(providerId) : undefined,
      message: credential ? `${provider.displayName} is connected.` : `${provider.displayName} is not connected.`
    };
  }

  async connectProvider(input: ConnectProviderInput): Promise<ProviderStatus> {
    const provider = this.requireProvider(input.providerId);

    if (input.authMode === 'codex_auth_experimental') {
      throw new Error('Codex auth reuse is not supported. Tajtlisha will not read ~/.codex/auth.json.');
    }

    if (!provider.authModes.includes(input.authMode)) {
      throw new Error(`${provider.displayName} does not support auth mode ${input.authMode}.`);
    }

    const secret = input.secret?.trim();
    if (!secret) {
      throw new Error(`${provider.displayName} requires a credential secret for ${input.authMode}.`);
    }

    await this.credentialStore.set({
      providerId: input.providerId,
      authMode: input.authMode,
      secret
    });

    return this.getProviderStatus(input.providerId);
  }

  async disconnectProvider(providerId: AiProviderId): Promise<ProviderStatus> {
    this.requireProvider(providerId);
    await this.credentialStore.delete(providerId);
    return this.getProviderStatus(providerId);
  }

  async testConnection(providerId: AiProviderId): Promise<TestConnectionResult> {
    return this.requireProvider(providerId).testConnection();
  }

  async listModels(
    providerId: AiProviderId,
    capability: keyof AiProviderCapabilities
  ): Promise<ProviderModelDescriptor[]> {
    return this.requireProvider(providerId).listModels(capability);
  }

  async transcribe(providerId: AiProviderId, request: TranscriptionRequest): Promise<TranscriptionResult> {
    return this.requireProvider(providerId).transcribe(request);
  }

  async translate(providerId: AiProviderId, request: TranslationRequest): Promise<SubtitleTrack> {
    return this.requireProvider(providerId).translate(request);
  }

  async polishSubtitles(providerId: AiProviderId, request: SubtitlePolishRequest): Promise<SubtitleTrack> {
    return this.requireProvider(providerId).polishSubtitles(request);
  }

  private requireProvider(providerId: AiProviderId): AiProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Unknown AI provider: ${providerId}`);
    }

    return provider;
  }

  private toSummary(provider: AiProvider): ProviderSummary {
    return {
      id: provider.id,
      displayName: provider.displayName,
      authModes: [...provider.authModes],
      capabilities: { ...provider.capabilities }
    };
  }

  private async maskedCredential(providerId: AiProviderId): Promise<string | undefined> {
    return (await this.credentialStore.getMaskedStatus(providerId)).maskedCredential;
  }
}
