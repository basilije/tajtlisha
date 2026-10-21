import type { AiProviderId, AuthMode } from './ai';

export type CredentialRecord = {
  providerId: AiProviderId;
  authMode: AuthMode;
  secret: string;
};

export type MaskedCredentialStatus = {
  providerId: AiProviderId;
  connected: boolean;
  authMode?: AuthMode;
  maskedCredential?: string;
};
