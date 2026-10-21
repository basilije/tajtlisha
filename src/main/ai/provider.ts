import type {
  AiProviderCapabilities,
  AiProviderId,
  AuthMode,
  ProviderModelDescriptor,
  ProviderSummary,
  SubtitlePolishRequest,
  TestConnectionResult,
  TranscriptionRequest,
  TranscriptionResult,
  TranslationRequest
} from '../../shared/types/ai';
import type { SubtitleTrack } from '../../shared/types/subtitles';
import type { CredentialStore } from '../credentials/credential-store';

export type AiProviderContext = {
  credentialStore: CredentialStore;
};

export type AiProvider = ProviderSummary & {
  listModels(capability: keyof AiProviderCapabilities): Promise<ProviderModelDescriptor[]>;
  testConnection(): Promise<TestConnectionResult>;
  transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;
  translate(request: TranslationRequest): Promise<SubtitleTrack>;
  polishSubtitles(request: SubtitlePolishRequest): Promise<SubtitleTrack>;
};

export type ProviderDefinition = ProviderSummary & {
  modelDescriptors: ProviderModelDescriptor[];
};

export class PlaceholderAiProvider implements AiProvider {
  readonly id: AiProviderId;
  readonly displayName: string;
  readonly authModes: AuthMode[];
  readonly capabilities: AiProviderCapabilities;

  private readonly modelDescriptors: ProviderModelDescriptor[];
  protected readonly credentialStore: CredentialStore;

  constructor(definition: ProviderDefinition, context: AiProviderContext) {
    this.id = definition.id;
    this.displayName = definition.displayName;
    this.authModes = definition.authModes;
    this.capabilities = definition.capabilities;
    this.modelDescriptors = definition.modelDescriptors;
    this.credentialStore = context.credentialStore;
  }

  async listModels(capability: keyof AiProviderCapabilities): Promise<ProviderModelDescriptor[]> {
    if (!this.capabilities[capability]) {
      return [];
    }

    return this.modelDescriptors
      .filter((model) => model.capability === capability)
      .map((model) => ({ ...model, available: model.available ?? true }));
  }

  async testConnection(): Promise<TestConnectionResult> {
    const credential = await this.credentialStore.get(this.id);
    const checkedAt = new Date().toISOString();

    if (!credential) {
      return {
        ok: false,
        providerId: this.id,
        checkedAt,
        message: `${this.displayName} is not connected.`
      };
    }

    return {
      ok: true,
      providerId: this.id,
      checkedAt,
      message: `${this.displayName} credential is present. Network validation is not implemented yet.`
    };
  }

  async transcribe(_request: TranscriptionRequest): Promise<TranscriptionResult> {
    throw this.notImplemented('transcription');
  }

  async translate(_request: TranslationRequest): Promise<SubtitleTrack> {
    throw this.notImplemented('translation');
  }

  async polishSubtitles(_request: SubtitlePolishRequest): Promise<SubtitleTrack> {
    throw this.notImplemented('subtitle polish');
  }

  private notImplemented(operation: string): Error {
    return new Error(`${this.displayName} ${operation} is not implemented in the placeholder provider.`);
  }
}
