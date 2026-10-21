import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

/** Size and mtime of the source file. A replaced file has a different fingerprint. */
export type SourceFingerprint = { size: number; mtimeMs: number };

type CacheEntry = {
  fingerprint: string;
  preview: Promise<string>;
};

/**
 * Session cache of transcoded preview files, one per source path. Each entry is
 * keyed by path and fingerprint, so a source that was replaced on disk is
 * transcoded again. Each file gets its own temp name, so two sources never
 * overwrite each other. Failed transcodes leave nothing behind and are retried
 * on the next request.
 */
export class PreviewProxyCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly dir: string,
    private readonly createFileName: () => string = () => `tajtlisha-preview-${randomUUID()}.mp4`
  ) {}

  /**
   * Resolves with the path of the preview for `inputPath`, running `create`
   * only when there is no cached (or in-flight) preview for this fingerprint.
   * The preview made for an older fingerprint of the same path is deleted.
   */
  get(inputPath: string, fingerprint: SourceFingerprint, create: (outputPath: string) => Promise<void>): Promise<string> {
    const key = fingerprintKey(fingerprint);
    const existing = this.entries.get(inputPath);
    if (existing?.fingerprint === key) return existing.preview;
    if (existing) {
      void this.discard(existing.preview);
    }

    const outputPath = join(this.dir, this.createFileName());
    const preview = create(outputPath).then(
      () => outputPath,
      async (error: unknown) => {
        if (this.entries.get(inputPath)?.preview === preview) this.entries.delete(inputPath);
        await rm(outputPath, { force: true }).catch(() => undefined);
        throw error;
      }
    );
    this.entries.set(inputPath, { fingerprint: key, preview });
    return preview;
  }

  /** Deletes every preview file made this session. Called on quit, after jobs have stopped. */
  async cleanup(): Promise<void> {
    const entries = [...this.entries.values()];
    this.entries.clear();
    await Promise.all(entries.map((entry) => this.discard(entry.preview)));
  }

  /** Waits for a preview to settle, then deletes its file if it was produced. */
  private async discard(preview: Promise<string>): Promise<void> {
    const path = await preview.then(
      (value) => value,
      () => undefined
    );
    if (path !== undefined) {
      await rm(path, { force: true }).catch(() => undefined);
    }
  }
}

function fingerprintKey(fingerprint: SourceFingerprint): string {
  return `${fingerprint.size}:${fingerprint.mtimeMs}`;
}
