/* @vitest-environment node */
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProjectDocument, ProjectSource } from '../../../src/shared/types/project';
import { ProjectStore } from '../../../src/main/project/project-store';

let root: string;
let projectsDir: string;
let videoPath: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tajtlisha-store-'));
  projectsDir = join(root, 'projects');
  videoPath = join(root, 'clip.mp4');
  await writeFile(videoPath, 'not really a video, but it has a size and an mtime');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function createStore(): ProjectStore {
  return new ProjectStore({ dir: projectsDir, createVideoUrl: (path) => `tajtlisha-media://video/${encodeURIComponent(path)}` });
}

async function sourceFor(path = videoPath, overrides: Partial<ProjectSource> = {}): Promise<ProjectSource> {
  const info = await stat(path);
  return {
    inputPath: path,
    fileUrl: 'tajtlisha-media://video/stale-session-url',
    durationMs: 4000,
    width: 1280,
    height: 720,
    hasAudio: true,
    fileSizeBytes: info.size,
    mtimeMs: info.mtimeMs,
    ...overrides
  };
}

function documentFor(id: string, revision: number, source: ProjectSource | null, captionText = `caption r${revision}`): ProjectDocument {
  return {
    schemaVersion: 1,
    id,
    revision,
    source,
    trim: { startMs: 0, endMs: 4000 },
    targetLanguage: 'sr-Latn',
    captions: [{ id: 'c1', startMs: 0, endMs: 1000, original: captionText, translation: '' }],
    style: { fontFamily: 'Noto Sans', fontSizePercent: 5 } as ProjectDocument['style'],
    previewTrack: 'original',
    updatedAt: '2026-10-22T10:00:00.000Z'
  };
}

describe('ProjectStore save and load', () => {
  it('round-trips a project, strips fileUrl on disk and writes the last-project pointer', async () => {
    const store = createStore();
    const source = await sourceFor();
    await store.save(documentFor('p1', 1, source));

    const onDisk = JSON.parse(await readFile(join(projectsDir, 'p1.json'), 'utf8')) as { source: Record<string, unknown> };
    expect(onDisk.source).not.toHaveProperty('fileUrl');
    expect(JSON.parse(await readFile(join(projectsDir, 'last.json'), 'utf8'))).toEqual({ projectId: 'p1' });

    const loaded = await store.loadLast();
    expect(loaded?.sourceStatus).toBe('ok');
    expect(loaded?.project.captions[0]?.original).toBe('caption r1');
    expect(loaded?.project.source?.fileUrl).toBe(`tajtlisha-media://video/${encodeURIComponent(videoPath)}`);
  });

  it('ignores a save with an older revision and reports the revision on disk', async () => {
    const store = createStore();
    await store.save(documentFor('p1', 2, await sourceFor()));

    const result = await store.save(documentFor('p1', 1, await sourceFor(), 'stale'));

    expect(result).toEqual({ savedRevision: 2 });
    const loaded = await store.loadLast();
    expect(loaded?.project.revision).toBe(2);
    expect(loaded?.project.captions[0]?.original).toBe('caption r2');
  });

  it('ends with the newest revision when saves are issued concurrently', async () => {
    const store = createStore();
    const source = await sourceFor();

    await Promise.all([store.save(documentFor('p1', 1, source)), store.save(documentFor('p1', 3, source)), store.save(documentFor('p1', 2, source))]);

    expect((await store.loadLast())?.project.revision).toBe(3);
  });

  it('flush resolves only after queued writes have finished', async () => {
    const store = createStore();
    const pending = store.save(documentFor('p1', 1, null));

    await store.flush();

    expect(JSON.parse(await readFile(join(projectsDir, 'p1.json'), 'utf8')).revision).toBe(1);
    await expect(pending).resolves.toEqual({ savedRevision: 1 });
  });

  it('keeps the previous file and pointer when a write fails midway', async () => {
    const store = createStore();
    await store.save(documentFor('p1', 1, null, 'first'));
    await store.save(documentFor('p2', 1, null, 'other'));
    // Replace the file with a directory so the rename of the temp file must fail.
    await rm(join(projectsDir, 'p1.json'));
    await mkdir(join(projectsDir, 'p1.json'));

    await expect(store.save(documentFor('p1', 2, null, 'second'))).rejects.toThrow();

    const entries = await readdir(projectsDir);
    expect(entries.filter((name) => name.endsWith('.tmp'))).toEqual([]);
    expect(JSON.parse(await readFile(join(projectsDir, 'last.json'), 'utf8'))).toEqual({ projectId: 'p2' });
  });

  it('rejects project ids that could escape the projects folder', async () => {
    const store = createStore();

    await expect(store.save(documentFor('../evil', 1, null))).rejects.toThrow('[UNKNOWN]');
  });

  it('returns null when there is no pointer yet', async () => {
    expect(await createStore().loadLast()).toBeNull();
  });
});

describe('ProjectStore source status on load', () => {
  it('reports missing with an empty fileUrl, keeping the captions', async () => {
    const store = createStore();
    const goneSource: ProjectSource = { ...(await sourceFor()), inputPath: join(root, 'gone.mp4') };
    await store.save(documentFor('p1', 1, goneSource));

    const loaded = await store.loadLast();

    expect(loaded?.sourceStatus).toBe('missing');
    expect(loaded?.project.source?.fileUrl).toBe('');
    expect(loaded?.project.captions).toHaveLength(1);
  });

  it('reports changed when size or mtime differ, and still mints a fresh URL', async () => {
    const store = createStore();
    const source = await sourceFor(videoPath, { fileSizeBytes: 1 });
    await store.save(documentFor('p1', 1, source));

    const loaded = await store.loadLast();

    expect(loaded?.sourceStatus).toBe('changed');
    expect(loaded?.project.source?.fileUrl).not.toBe('');
  });

  it('loads a project without a source as ok', async () => {
    const store = createStore();
    await store.save(documentFor('p1', 1, null));

    expect(await store.loadLast()).toMatchObject({ sourceStatus: 'ok', project: { source: null } });
  });
});

describe('ProjectStore corrupt files', () => {
  it('moves a document with the wrong shape aside and returns null', async () => {
    const store = createStore();
    await mkdir(projectsDir, { recursive: true });
    await writeFile(join(projectsDir, 'p1.json'), JSON.stringify({ schemaVersion: 2, id: 'p1', revision: 1, captions: [] }));
    await writeFile(join(projectsDir, 'last.json'), JSON.stringify({ projectId: 'p1' }));

    expect(await store.loadLast()).toBeNull();

    const entries = await readdir(projectsDir);
    expect(entries).not.toContain('p1.json');
    expect(entries.some((name) => /^p1\.corrupt-\d+\.json$/.test(name))).toBe(true);
  });

  it('moves unparseable JSON aside and returns null', async () => {
    const store = createStore();
    await mkdir(projectsDir, { recursive: true });
    await writeFile(join(projectsDir, 'p1.json'), '{ "schemaVersion": 1, "id": ');
    await writeFile(join(projectsDir, 'last.json'), JSON.stringify({ projectId: 'p1' }));

    expect(await store.loadLast()).toBeNull();
    expect((await readdir(projectsDir)).some((name) => name.startsWith('p1.corrupt-'))).toBe(true);
  });

  it('treats an unreadable pointer as no last project', async () => {
    await mkdir(projectsDir, { recursive: true });
    await writeFile(join(projectsDir, 'last.json'), 'not json');

    expect(await createStore().loadLast()).toBeNull();
  });
});
