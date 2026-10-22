/* @vitest-environment node */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { SecretFieldError, SettingsStore } from '../../../src/main/settings';

describe('SettingsStore', () => {
  it('merges partial settings onto defaults and persists them', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tajtlisha-settings-'));
    const filePath = join(dir, 'settings.json');

    try {
      const store = new SettingsStore({ filePath });
      const updated = await store.update({
        uiLanguage: 'sr-Latn',
        exportDefaults: {
          exportOriginalSrt: false,
          exportTranslatedSrt: true,
          defaultBurnedInTrack: 'translation',
          overwritePolicy: 'create_copy',
          fileNamePattern: '{name}.{language}.{track}'
        }
      });

      expect(updated.uiLanguage).toBe('sr-Latn');
      expect(updated.exportDefaults.exportOriginalSrt).toBe(false);
      expect(updated.neverModifyOriginalVideo).toBe(true);

      const persisted = JSON.parse(await readFile(filePath, 'utf8'));
      expect(persisted.uiLanguage).toBe('sr-Latn');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects secret-like fields anywhere in the patch', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tajtlisha-settings-'));
    const store = new SettingsStore({ filePath: join(dir, 'settings.json') });

    try {
      await expect(
        store.update({
          aiConnector: {
            apiKey: 'sk-test'
          } as never
        })
      ).rejects.toBeInstanceOf(SecretFieldError);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('serializes concurrent updates and persists the merged result atomically', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tajtlisha-settings-'));
    const filePath = join(dir, 'settings.json');

    try {
      const store = new SettingsStore({ filePath });
      await Promise.all([
        store.update({ uiLanguage: 'sr-Cyrl' }),
        store.update({
          exportDefaults: {
            exportOriginalSrt: true,
            exportTranslatedSrt: true,
            defaultBurnedInTrack: 'original',
            overwritePolicy: 'create_copy',
            fileNamePattern: '{name}.{language}.{track}'
          }
        })
      ]);

      const persisted = JSON.parse(await readFile(filePath, 'utf8'));
      expect(persisted.uiLanguage).toBe('sr-Cyrl');
      expect(persisted.exportDefaults.exportTranslatedSrt).toBe(true);
      expect(persisted.neverModifyOriginalVideo).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('treats an empty string as clearing an optional setting', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tajtlisha-settings-'));
    try {
      const store = new SettingsStore({ filePath: join(dir, 'settings.json') });
      await store.update({ defaultOutputFolder: '/videos/out' });
      const cleared = await store.update({ defaultOutputFolder: '' });
      expect(cleared.defaultOutputFolder).toBeUndefined();
      expect('defaultOutputFolder' in (await store.get())).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
