/* @vitest-environment node */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

  it('defaults the UI zoom to 100% and snaps patched values to a level', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tajtlisha-settings-'));
    try {
      const store = new SettingsStore({ filePath: join(dir, 'settings.json') });
      expect((await store.get()).uiZoomPercent).toBe(100);

      expect((await store.update({ uiZoomPercent: 103 })).uiZoomPercent).toBe(105);
      expect((await store.update({ uiZoomPercent: 999 })).uiZoomPercent).toBe(150);
      expect((await store.update({ uiZoomPercent: 'abc' as never })).uiZoomPercent).toBe(100);

      const persisted = JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8'));
      expect(persisted.uiZoomPercent).toBe(100);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('normalizes a hand-edited UI zoom when the file is read', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tajtlisha-settings-'));
    try {
      const filePath = join(dir, 'settings.json');
      const store = new SettingsStore({ filePath });

      await writeFile(filePath, JSON.stringify({ uiZoomPercent: 999 }), 'utf8');
      expect((await store.get()).uiZoomPercent).toBe(150);

      await writeFile(filePath, JSON.stringify({ uiZoomPercent: 'abc' }), 'utf8');
      expect((await store.get()).uiZoomPercent).toBe(100);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
