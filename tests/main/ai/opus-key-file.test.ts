import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryCredentialStore } from '../../../src/main/credentials/memory-credential-store';
import { importOpusKey, opusKeyCandidates, parseOpusKeyFile } from '../../../src/main/credentials/opus-key-file';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('opus key file', () => {
  it('reads a raw line or an OPUSCLIP_API_KEY assignment and skips comments', () => {
    expect(parseOpusKeyFile('  sk-raw-key  \n')).toBe('sk-raw-key');
    expect(parseOpusKeyFile('# note\nOPUSCLIP_ORG_ID=\nOPUSCLIP_API_KEY="sk-from-env"\n')).toBe('sk-from-env');
    expect(parseOpusKeyFile('# only a comment\nOPUSCLIP_API_KEY=\n')).toBeUndefined();
  });

  it('looks beside the exe and in the profile, and at the local env file only while unpackaged', () => {
    const packaged = opusKeyCandidates({
      exeDir: 'C:/Program',
      userDataDir: 'C:/Users/me/AppData/Roaming/Tajtlisha',
      appPath: 'C:/Program/resources/app.asar',
      isPackaged: true
    });
    expect(packaged).toEqual([
      join('C:/Program', 'opus.key'),
      join('C:/Users/me/AppData/Roaming/Tajtlisha', 'opus.key')
    ]);

    const dev = opusKeyCandidates({
      exeDir: 'C:/electron',
      userDataDir: 'C:/profile',
      appPath: 'F:/AI/tajtlisha',
      isPackaged: false
    });
    expect(dev).toContain(join('F:/AI/tajtlisha', '..', 'opus-connection', '.env'));
  });

  it('imports the first file that contains a key into the credential store', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'opus-key-'));
    directories.push(dir);
    await writeFile(join(dir, 'empty.key'), '# nothing\n', 'utf8');
    await writeFile(join(dir, 'opus.key'), 'OPUSCLIP_API_KEY=sk-file-key\n', 'utf8');
    const store = new MemoryCredentialStore();

    await expect(importOpusKey(store, [join(dir, 'missing.key'), join(dir, 'empty.key'), join(dir, 'opus.key')])).resolves.toBe(true);
    await expect(store.get('opus')).resolves.toEqual({
      providerId: 'opus',
      authMode: 'api_key',
      secret: 'sk-file-key'
    });
    await expect(importOpusKey(store, [join(dir, 'empty.key')])).resolves.toBe(false);
  });
});
