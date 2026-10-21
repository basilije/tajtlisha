import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat as fsStat, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { AppError } from '../../shared/errors';
import type { ProjectDocument, ProjectLoadResult, ProjectSource } from '../../shared/types/project';
import { PROJECT_ID_PATTERN, validateProjectDocument } from './project-schema';

const POINTER_FILE = 'last.json';

export type FileStat = {
  size: number;
  mtimeMs: number;
  isFile: boolean;
};

export type StatFile = (path: string) => Promise<FileStat>;

export type ProjectStoreOptions = {
  /** userData/projects. Created on first save. */
  dir: string;
  /** Mints a fresh playback URL; called on every load, never persisted. */
  createVideoUrl: (inputPath: string) => string;
  /**
   * True when ffprobe finds a video stream in the file. A saved project is
   * only given a playback URL when this holds, so a forged file cannot be
   * served through the media protocol.
   */
  probeVideo: (inputPath: string) => Promise<boolean>;
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
  private readonly probeVideo: (inputPath: string) => Promise<boolean>;
  private readonly stat: StatFile;
  /** Tail of the write chain per project id. Tails never reject. */
  private readonly queues = new Map<string, Promise<void>>();
  private readonly pending = new Set<Promise<void>>();
  /** Highest revision known to be on disk, per project id. */
  private readonly savedRevisions = new Map<string, number>();

  constructor(options: ProjectStoreOptions) {
    this.dir = options.dir;
    this.createVideoUrl = options.createVideoUrl;
    this.probeVideo = options.probeVideo;
    this.stat = options.stat ?? defaultStatFile;
  }

  /**
   * Saves `doc` unless a newer revision is already on disk. Resolves with the
   * revision that is on disk once this save has been processed. An invalid
   * document is rejected before anything is written, so the previous file stays.
   */
  async save(doc: ProjectDocument): Promise<{ savedRevision: number }> {
    const valid = validateProjectDocument(doc);
    assertProjectId(valid.id);
    return this.enqueue(valid.id, () => this.writeIfNewer(valid));
  }

  /** Resolves when every save queued so far has finished (successfully or not). */
  async flush(): Promise<void> {
    while (this.pending.size > 0) {
      await Promise.all([...this.pending]);
    }
  }

  /**
   * The last opened project, or null when there is none or its file is
   * unreadable. A document that fails validation is renamed to
   * `<id>.corrupt-<ts>.json` and treated as absent.
   */
  async loadLast(): Promise<ProjectLoadResult | null> {
    const projectId = await this.readLastProjectId();
    if (!projectId) return null;

    const documentPath = this.documentPath(projectId);
    const text = await readTextIfExists(documentPath);
    if (text === undefined) return null;

    const valid = parseValidProject(text);
    if (!valid || valid.id !== projectId) {
      await this.quarantine(projectId, documentPath);
      return null;
    }

    return this.withFreshSource(valid);
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

  private async withFreshSource(stored: ProjectDocument): Promise<ProjectLoadResult> {
    if (!stored.source) {
      return { project: stored, sourceStatus: 'ok' };
    }

    const { inputPath } = stored.source;
    // A playback URL is only minted for a regular video file. Anything else
    // keeps its captions but is reported as missing, with no URL.
    const current = isAbsolute(inputPath) ? await this.statOrNull(inputPath) : null;
    if (!current?.isFile || !(await this.hasVideoStream(inputPath))) {
      return { project: withSourceUrl(stored, ''), sourceStatus: 'missing' };
    }

    // Same size and mtime as at import means the same file. Keep the stored
    // values so the 'changed' state persists until the user relinks the video.
    const changed = current.size !== stored.source.fileSizeBytes || current.mtimeMs !== stored.source.mtimeMs;
    return {
      project: withSourceUrl(stored, this.createVideoUrl(inputPath)),
      sourceStatus: changed ? 'changed' : 'ok'
    };
  }

  /** A probe failure (ffprobe missing, unreadable file) counts as no video stream. */
  private async hasVideoStream(path: string): Promise<boolean> {
    try {
      return await this.probeVideo(path);
    } catch {
      return false;
    }
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
  return { size: info.size, mtimeMs: info.mtimeMs, isFile: info.isFile() };
};

function assertProjectId(projectId: string): void {
  if (!PROJECT_ID_PATTERN.test(projectId)) {
    throw new AppError('UNKNOWN', 'project id must be 1-128 letters, digits, "-" or "_".');
  }
}

function withSourceUrl(doc: ProjectDocument, fileUrl: string): ProjectDocument {
  return doc.source ? { ...doc, source: { ...doc.source, fileUrl } } : doc;
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

/** The validated document, or undefined when the text is not JSON or fails validation. */
function parseValidProject(text: string): ProjectDocument | undefined {
  try {
    return validateProjectDocument(JSON.parse(text) as unknown);
  } catch {
    return undefined;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
