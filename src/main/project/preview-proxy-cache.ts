import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Session cache of transcoded preview files, one per source path. Each file
 * gets its own temp name, so two sources never overwrite each other. Failed
 * transcodes leave nothing behind and are retried on the next request.
 */
export class PreviewProxyCache {
  private readonly entries = new Map<string, Promise<string>>();

  constructor(
    private readonly dir: string,
    private readonly createFileName: () => string = () => `tajtlisha-preview-${randomUUID()}.mp4`
  ) {}

  /**
   * Resolves with the path of the preview for `inputPath`, running `create`
   * only when there is no cached (or in-flight) preview for it.
   */
  get(inputPath: string, create: (outputPath: string) => Promise<void>): Promise<string> {
    const existing = this.entries.get(inputPath);
    if (existing) return existing;

    const outputPath = join(this.dir, this.createFileName());
    const entry = create(outputPath).then(
      () => outputPath,
      async (error: unknown) => {
        this.entries.delete(inputPath);
        await rm(outputPath, { force: true }).catch(() => undefined);
        throw error;
      }
    );
    this.entries.set(inputPath, entry);
    return entry;
  }

  /** Deletes every preview file made this session. Called on quit. */
  async cleanup(): Promise<void> {
    const settled = await Promise.all([...this.entries.values()].map((entry) => entry.then(
      (path) => path,
      () => undefined
    )));
    this.entries.clear();
    await Promise.all(
      settled.filter((path): path is string => path !== undefined).map((path) => rm(path, { force: true }).catch(() => undefined))
    );
  }
}
