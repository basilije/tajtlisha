import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CredentialStore } from './credential-store';

export type OpusKeyLocations = {
  exeDir: string;
  userDataDir: string;
  appPath: string;
  isPackaged: boolean;
};

/** Places the installed app looks for a key, before it is copied into the encrypted store. */
export function opusKeyCandidates(locations: OpusKeyLocations): string[] {
  const candidates = [join(locations.exeDir, 'opus.key'), join(locations.userDataDir, 'opus.key')];
  if (!locations.isPackaged) {
    candidates.push(join(locations.appPath, 'opus.key'));
    candidates.push(join(locations.appPath, '..', 'opus-connection', '.env'));
  }
  return candidates;
}

/**
 * Accepts a raw key on its own line, or an env line `OPUSCLIP_API_KEY=...`.
 * Blank lines, comments, and other env names are skipped.
 */
export function parseOpusKeyFile(text: string): string | undefined {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const equals = line.indexOf('=');
    if (equals === -1) {
      return line;
    }
    const name = line.slice(0, equals).trim();
    const value = line.slice(equals + 1).trim().replace(/^['"]|['"]$/g, '');
    if (name === 'OPUSCLIP_API_KEY' && value) {
      return value;
    }
  }
  return undefined;
}

/** Reads the first usable key file and stores it for Opus. Returns false when no file has a key. */
export async function importOpusKey(store: CredentialStore, files: readonly string[]): Promise<boolean> {
  for (const file of files) {
    let text: string;
    try {
      text = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    const secret = parseOpusKeyFile(text);
    if (!secret) {
      continue;
    }
    await store.set({ providerId: 'opus', authMode: 'api_key', secret });
    return true;
  }
  return false;
}
