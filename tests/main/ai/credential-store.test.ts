import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { maskSecret } from '../../../src/main/credentials/credential-store';
import { MemoryCredentialStore } from '../../../src/main/credentials/memory-credential-store';
import { SecureCredentialStore, type CredentialCrypto } from '../../../src/main/credentials/secure-credential-store';

describe('credential store masking', () => {
  it('masks secrets without returning the raw value', () => {
    const secret = 'sk-test-1234567890';

    const masked = maskSecret(secret);

    expect(masked).not.toBe(secret);
    expect(masked).toBe('sk-t********7890');
  });

  it('returns only masked credential status', async () => {
    const store = new MemoryCredentialStore();
    await store.set({
      providerId: 'openai',
      authMode: 'api_key',
      secret: 'sk-live-secret'
    });

    const status = await store.getMaskedStatus('openai');

    expect(status).toEqual({
      providerId: 'openai',
      connected: true,
      authMode: 'api_key',
      maskedCredential: 'sk-l********cret'
    });
    expect(JSON.stringify(status)).not.toContain('sk-live-secret');
  });

  it('persists encrypted credentials without writing raw secrets', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tajtlisha-credentials-'));
    const filePath = join(dir, 'credentials.json');
    const crypto = createTestCrypto();
    const store = new SecureCredentialStore({ filePath, crypto });

    await store.set({
      providerId: 'openai',
      authMode: 'api_key',
      secret: 'sk-persisted-secret'
    });

    const fileContent = await readFile(filePath, 'utf8');
    expect(fileContent).not.toContain('sk-persisted-secret');
    expect(fileContent).toContain('encryptedSecret');

    const restored = new SecureCredentialStore({ filePath, crypto });
    await expect(restored.get('openai')).resolves.toEqual({
      providerId: 'openai',
      authMode: 'api_key',
      secret: 'sk-persisted-secret'
    });
    await expect(restored.getMaskedStatus('openai')).resolves.toMatchObject({
      connected: true,
      maskedCredential: 'sk-p********cret'
    });

    await restored.delete('openai');
    await expect(restored.get('openai')).resolves.toBeUndefined();
  });

  it('fails closed when OS credential encryption is unavailable', async () => {
    const store = new SecureCredentialStore({
      filePath: join(await mkdtemp(join(tmpdir(), 'tajtlisha-credentials-')), 'credentials.json'),
      crypto: {
        ...createTestCrypto(),
        isEncryptionAvailable: () => false
      }
    });

    await expect(
      store.set({
        providerId: 'openai',
        authMode: 'api_key',
        secret: 'sk-secret'
      })
    ).rejects.toThrow('OS credential encryption is not available');
  });
});

function createTestCrypto(): CredentialCrypto {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${Buffer.from(value, 'utf8').toString('base64')}`, 'utf8'),
    decryptString: (value) => {
      const encoded = value.toString('utf8').replace(/^encrypted:/, '');
      return Buffer.from(encoded, 'base64').toString('utf8');
    }
  };
}
