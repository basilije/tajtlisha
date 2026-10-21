import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import type { AiProviderId, AuthMode } from '../../shared/types/ai';
import type { CredentialRecord, MaskedCredentialStatus } from '../../shared/types/credentials';
import type { CredentialStore } from './credential-store';
import { toMaskedCredentialStatus } from './credential-store';

export type CredentialCrypto = {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
};

type StoredCredential = {
  providerId: AiProviderId;
  authMode: AuthMode;
  encryptedSecret: string;
};

type CredentialFile = {
  version: 1;
  credentials: StoredCredential[];
};

export type SecureCredentialStoreOptions = {
  filePath?: string;
  crypto: CredentialCrypto;
};

export class SecureCredentialStore implements CredentialStore {
  private readonly filePath: string;
  private readonly crypto: CredentialCrypto;

  constructor(options: SecureCredentialStoreOptions) {
    this.filePath = options.filePath ?? join(homedir(), '.config', 'tajtlisha', 'credentials.json');
    this.crypto = options.crypto;
  }

  async get(providerId: AiProviderId): Promise<CredentialRecord | undefined> {
    const stored = (await this.read()).credentials.find((credential) => credential.providerId === providerId);
    if (!stored) {
      return undefined;
    }

    return {
      providerId: stored.providerId,
      authMode: stored.authMode,
      secret: this.decryptSecret(stored.encryptedSecret)
    };
  }

  async set(record: CredentialRecord): Promise<void> {
    this.assertEncryptionAvailable();
    const current = await this.read();
    const nextCredential: StoredCredential = {
      providerId: record.providerId,
      authMode: record.authMode,
      encryptedSecret: this.crypto.encryptString(record.secret).toString('base64')
    };
    const credentials = [
      ...current.credentials.filter((credential) => credential.providerId !== record.providerId),
      nextCredential
    ];

    await this.write({ version: 1, credentials });
  }

  async delete(providerId: AiProviderId): Promise<void> {
    const current = await this.read();
    const credentials = current.credentials.filter((credential) => credential.providerId !== providerId);

    if (credentials.length === 0) {
      await rm(this.filePath, { force: true });
      return;
    }

    await this.write({ version: 1, credentials });
  }

  async getMaskedStatus(providerId: AiProviderId): Promise<MaskedCredentialStatus> {
    return toMaskedCredentialStatus(await this.get(providerId), providerId);
  }

  private decryptSecret(encryptedSecret: string): string {
    this.assertEncryptionAvailable();
    return this.crypto.decryptString(Buffer.from(encryptedSecret, 'base64'));
  }

  private assertEncryptionAvailable(): void {
    if (!this.crypto.isEncryptionAvailable()) {
      throw new Error('OS credential encryption is not available.');
    }
  }

  private async read(): Promise<CredentialFile> {
    try {
      const payload = JSON.parse(await readFile(this.filePath, 'utf8')) as CredentialFile;
      return {
        version: 1,
        credentials: Array.isArray(payload.credentials) ? payload.credentials : []
      };
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return { version: 1, credentials: [] };
      }
      throw error;
    }
  }

  private async write(file: CredentialFile): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
