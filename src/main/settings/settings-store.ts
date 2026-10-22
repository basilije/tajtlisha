import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { AppSettings } from '../../shared/types/settings';
import { normalizeUiZoom } from '../../shared/ui-zoom';
import { DEFAULT_APP_SETTINGS } from './defaults';
import { rejectSecretFields } from './secret-fields';

type JsonObject = Record<string, unknown>;

export type SettingsStoreOptions = {
  filePath?: string;
};

export class SettingsStore {
  private readonly filePath: string;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(options: SettingsStoreOptions = {}) {
    this.filePath = options.filePath ?? join(homedir(), '.config', 'tajtlisha', 'settings.json');
  }

  async get(): Promise<AppSettings> {
    const stored = await this.readStoredSettings();
    // Hand-edited files go through the same normalization as patches.
    return normalizeSettings(mergeSettings(DEFAULT_APP_SETTINGS, stored));
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    rejectSecretFields(patch);

    return this.enqueue(async () => {
      const current = await this.get();
      const next = normalizeSettings(mergeSettings(current, patch as JsonObject));
      await this.write(next);
      return next;
    });
  }

  async reset(): Promise<AppSettings> {
    return this.enqueue(async () => {
      await this.write(DEFAULT_APP_SETTINGS);
      return DEFAULT_APP_SETTINGS;
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async readStoredSettings(): Promise<JsonObject> {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8')) as JsonObject;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  private async write(settings: AppSettings): Promise<void> {
    const directory = dirname(this.filePath);
    await mkdir(directory, { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
      await rename(temporaryPath, this.filePath);
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }
}

export function mergeSettings<T extends JsonObject>(base: T, patch: JsonObject): T {
  const output: JsonObject = { ...base };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }

    const baseValue = output[key];
    if (isPlainObject(baseValue) && isPlainObject(value)) {
      output[key] = mergeSettings(baseValue, value);
      continue;
    }

    output[key] = value;
  }

  return output as T;
}

function normalizeSettings(settings: AppSettings): AppSettings {
  // Patches cannot carry `undefined` through IPC/JSON merge, so the UI clears an
  // optional text setting by sending ''. Store that as "not set".
  const cleared: AppSettings = { ...settings };
  if (cleared.defaultOutputFolder === '') delete cleared.defaultOutputFolder;
  if (cleared.workingFolder === '') delete cleared.workingFolder;
  if (cleared.aiConnector.defaultTargetLanguage === '') {
    cleared.aiConnector = { ...cleared.aiConnector };
    delete cleared.aiConnector.defaultTargetLanguage;
  }
  settings = cleared;
  return {
    ...settings,
    neverModifyOriginalVideo: true,
    uiZoomPercent: normalizeUiZoom(settings.uiZoomPercent),
    aiConnector: {
      ...settings.aiConnector,
      // This build has a single provider. A saved openai/openrouter choice would point at nothing.
      activeProviderId: 'opus',
      maxLinesPerCaption: settings.aiConnector.maxLinesPerCaption === 1 ? 1 : 2
    }
  };
}

function isPlainObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
