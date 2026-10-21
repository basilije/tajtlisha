import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat as fsStat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError } from '../../shared/errors';
import type { ProjectDocument, ProjectLoadResult, ProjectSource } from '../../shared/types/project';

const SCHEMA_VERSION = 1;
const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const POINTER_FILE = 'last.json';

export type FileStat = {
  size: number;
  mtimeMs: number;
};

export type StatFile = (path: string) => Promise<FileStat>;

export type ProjectStoreOptions = {
  /** userData/projects. Created on first save. */
  dir: string;
  /** Mints a fresh playback URL; called on every load, never persisted. */
  createVideoUrl: (inputPath: string) => string;
  stat?: StatFile;
};

/** What is written to disk: the source has no playback URL. */
type StoredSource = Omit<ProjectSource, 'fileUrl'>;
type StoredProject = Omit<ProjectDocument, 'source'> & { source: StoredSource | null };

/**
 * Persists projects as `<dir>/<id>.json` and remembers the last opened one in
 * `<dir>/last.json`. Writes run per project in order and go through a temp file
 * plus rename, so a crash never leaves a half-written project behind.
 */
export class ProjectStore {
  private readonly dir: string;
  private readonly createVideoUrl: (inputPath: string) => string;
  private readonly stat: StatFile;
  /** Tail of the write chain per project id. Tails never reject. */
  private readonly queues = new Map<string, Promise<void>>();
  private readonly pending = new Set<Promise<void>>();
  /** Highest revision known to be on disk, per project id. */
  private readonly savedRevisions = new Map<string, number>();

  constructor(options: ProjectStoreOptions) {
    this.dir = options.dir;
    this.createVideoUrl = options.createVideoUrl;
    this.stat = options.stat ?? defaultStatFile;
  }

  /**
   * Saves `doc` unless a newer revision is already on disk. Resolves with the
   * revision that is on disk once this save has been processed.
   */
  async save(doc: ProjectDocument): Promise<{ savedRevision: number }> {
    assertProjectId(doc.id);
    return this.enqueue(doc.id, () => this.writeIfNewer(doc));
  }

  /** Resolves when every save queued so far has finished (successfully or not). */
  async flush(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.all([...this.pending]);
    }
  }

  /**
   * The last opened project, or null when there is none or its file is
   * unreadable. A file with the wrong shape is renamed to `<id>.corrupt-<ts>.json`.
   */
  async loadLast(): Promise<ProjectLoadResult | null> {
    const projectId = await this.readLastProjectId();
    if (!projectId) return null;

    const documentPath = this.documentPath(projectId);
    const text = await readTextIfExists(documentPath);
    if (text === undefined) return null;

    const parsed = parseJson(text);
    if (!isStoredProject(parsed) || parsed.id !== projectId) {
      await this.quarantine(projectId, documentPath);
      return null;
    }

    return this.withFreshSource(parsed);
  }

  private async writeIfNewer(doc: ProjectDocument): Promise<{ savedRevision: number }> {
    const savedRevision = await this.lastSavedRevision(doc.id);
    if (doc.revision < savedRevision) {
      return { savedRevision };
    }

    await mkdir(this.dir, { recursive: true });
    await writeJsonAtomic(this.documentPath(doc.id), toStoredProject(doc));
    await writeJsonAtomic(join(this.dir, POINTER_FILE), { projectId: doc.id });
    this.savedRevisions.set(doc.id, doc.revision);
    return { savedRevision: doc.revision };
  }

  private async lastSavedRevision(projectId: string): Promise<number> {
    const cached = this.savedRevisions.get(projectId);
    if (cached !== undefined) return cached;

    // Nothing saved in this session yet: the file from an earlier run decides.
    const text = await readTextIfExists(this.documentPath(projectId));
    const parsed = text === undefined ? undefined : parseJson(text);
    const revision = isRecord(parsed) && typeof parsed.revision === 'number' ? parsed.revision : Number.NEGATIVE_INFINITY;
    this.savedRevisions.set(projectId, revision);
    return revision;
  }

  private enqueue<T>(projectId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(projectId) ?? Promise.resolve();
    const result = previous.then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined
    );
    this.queues.set(projectId, tail);
    this.pending.add(tail);
    void tail.then(() => {
      this.pending.delete(tail);
      if (this.queues.get(projectId) === tail) this.queues.delete(projectId);
    });
    return result;
  }

  private async readLastProjectId(): Promise<string | undefined> {
    const text = await readTextIfExists(join(this.dir, POINTER_FILE));
    const pointer = text === undefined ? undefined : parseJson(text);
    if (!isRecord(pointer) || typeof pointer.projectId !== 'string' || !PROJECT_ID_PATTERN.test(pointer.projectId)) {
      return undefined;
    }
    return pointer.projectId;
  }

  private async withFreshSource(stored: StoredProject): Promise<ProjectLoadResult> {
    if (!stored.source) {
      return { project: { ...stored, source: null }, sourceStatus: 'ok' };
    }

    const { inputPath } = stored.source;
    const current = await this.statOrNull(inputPath);
    if (!current) {
      return { project: { ...stored, source: { ...stored.source, fileUrl: '' } }, sourceStatus: 'missing' };
    }

    // Same size and mtime as at import means the same file. Keep the stored
    // values so the 'changed' state persists until the user relinks the video.
    const changed = current.size !== stored.source.fileSizeBytes || current.mtimeMs !== stored.source.mtimeMs;
    return {
      project: { ...stored, source: { ...stored.source, fileUrl: this.createVideoUrl(inputPath) } },
      sourceStatus: changed ? 'changed' : 'ok'
    };
  }

  /** Any stat failure (missing, unreadable) counts as missing so captions still load. */
  private async statOrNull(path: string): Promise<FileStat | null> {
    try {
      return await this.stat(path);
    } catch {
      return null;
    }
  }

  private async quarantine(projectId: string, documentPath: string): Promise<void> {
    const target = join(this.dir, `${projectId}.corrupt-${Date.now()}.json`);
    await rename(documentPath, target).catch(() => undefined);
  }

  private documentPath(projectId: string): string {
    return join(this.dir, `${projectId}.json`);
  }
}

export const defaultStatFile: StatFile = async (path) => {
  const info = await fsStat(path);
  return { size: info.size, mtimeMs: info.mtimeMs };
};

function assertProjectId(projectId: string): void {
  if (!PROJECT_ID_PATTERN.test(projectId)) {
    throw new AppError('UNKNOWN', 'project id must be 1-128 letters, digits, "-" or "_".');
  }
}

function toStoredProject(doc: ProjectDocument): StoredProject {
  if (!doc.source) {
    return { ...doc, source: null };
  }
  // The playback URL is ephemeral and is minted again on load.
  const { fileUrl: _fileUrl, ...source } = doc.source;
  return { ...doc, source };
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const tempPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function readTextIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isStoredProject(value: unknown): value is StoredProject {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== SCHEMA_VERSION) return false;
  if (typeof value.id !== 'string' || !PROJECT_ID_PATTERN.test(value.id)) return false;
  if (typeof value.revision !== 'number' || !Number.isFinite(value.revision)) return false;
  if (!Array.isArray(value.captions)) return false;
  if (value.source === undefined || value.source === null) return true;
  return isRecord(value.source) && typeof value.source.inputPath === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
