import type { AiProviderId } from '../../shared/types/ai';
import type { CredentialRecord, MaskedCredentialStatus } from '../../shared/types/credentials';
import type { CredentialStore } from './credential-store';
import { toMaskedCredentialStatus } from './credential-store';

export class MemoryCredentialStore implements CredentialStore {
  private readonly records = new Map<AiProviderId, CredentialRecord>();

  async get(providerId: AiProviderId): Promise<CredentialRecord | undefined> {
    const record = this.records.get(providerId);
    return record ? { ...record } : undefined;
  }

  async set(record: CredentialRecord): Promise<void> {
    this.records.set(record.providerId, { ...record });
  }

  async delete(providerId: AiProviderId): Promise<void> {
    this.records.delete(providerId);
  }

  async getMaskedStatus(providerId: AiProviderId): Promise<MaskedCredentialStatus> {
    return toMaskedCredentialStatus(this.records.get(providerId), providerId);
  }
}
