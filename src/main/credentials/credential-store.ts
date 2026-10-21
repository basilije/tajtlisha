import type { AiProviderId, AuthMode } from '../../shared/types/ai';
import type { CredentialRecord, MaskedCredentialStatus } from '../../shared/types/credentials';

type StoredCredential = {
  authMode: AuthMode;
  secret: string;
};

export type CredentialStore = {
  get(providerId: AiProviderId): Promise<CredentialRecord | undefined>;
  set(record: CredentialRecord): Promise<void>;
  delete(providerId: AiProviderId): Promise<void>;
  getMaskedStatus(providerId: AiProviderId): Promise<MaskedCredentialStatus>;
};

export function maskSecret(secret: string): string {
  if (!secret) {
    return '';
  }

  const visiblePrefix = Math.min(4, secret.length);
  const visibleSuffix = secret.length > 12 ? 4 : 0;
  const prefix = secret.slice(0, visiblePrefix);
  const suffix = visibleSuffix ? secret.slice(-visibleSuffix) : '';

  return `${prefix}${'*'.repeat(8)}${suffix}`;
}

export function toMaskedCredentialStatus(record?: CredentialRecord, providerId?: AiProviderId): MaskedCredentialStatus {
  if (!record && !providerId) {
    throw new Error('providerId is required when no credential record is available');
  }
  const statusProviderId = record?.providerId ?? providerId;

  return {
    providerId: statusProviderId as AiProviderId,
    connected: Boolean(record),
    authMode: record?.authMode,
    maskedCredential: record ? maskSecret(record.secret) : undefined
  };
}

export class InMemoryCredentialStore {
  private credentials = new Map<AiProviderId, StoredCredential>();

  saveCredential(providerId: AiProviderId, authMode: AuthMode, secret: string): void {
    this.credentials.set(providerId, { authMode, secret });
  }

  getCredential(providerId: AiProviderId): StoredCredential | undefined {
    return this.credentials.get(providerId);
  }

  deleteCredential(providerId: AiProviderId): void {
    this.credentials.delete(providerId);
  }

  listConnectedProviders(): AiProviderId[] {
    return [...this.credentials.keys()];
  }

  getMaskedCredentialStatus(providerId: AiProviderId): MaskedCredentialStatus {
    const credential = this.credentials.get(providerId);
    return {
      providerId,
      connected: Boolean(credential),
      authMode: credential?.authMode,
      maskedCredential: credential ? maskSecret(credential.secret) : undefined
    };
  }
}

export const credentialStore = new InMemoryCredentialStore();
