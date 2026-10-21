import { DEFAULT_SUBTITLE_STYLE, SUBTITLE_PRESETS, clamp } from '../../../shared/subtitle-geometry';
import type { CaptionRow, PreviewTrack, ProjectDocument, ProjectSource, TrimRange } from '../../../shared/types/project';
import type { SubtitlePresetId, SubtitleStyle } from '../../../shared/types/style';

export const HISTORY_LIMIT = 100;
export const MIN_TRIM_MS = 100;
export const MIN_CAPTION_MS = 300;
export const DEFAULT_CAPTION_MS = 2000;
/** Minimum free room (ms) at the insert position for caption/insert to succeed. */
export const MIN_INSERT_ROOM_MS = 300;
/** Consecutive text edits on the same caption field within this window share one undo step. */
export const COALESCE_WINDOW_MS = 1000;

export type NudgeEdge = 'start' | 'end' | 'both';

export type CaptionTimingPatch = Partial<Pick<CaptionRow, 'startMs' | 'endMs' | 'original' | 'translation'>>;

export type ProjectState = {
  project: ProjectDocument;
  past: ProjectDocument[];
  future: ProjectDocument[];
  /** Increments on every content change. Used by autosave and stale-job checks. */
  revision: number;
  lastCoalesceKey?: string;
  lastCoalesceAt?: number;
};

export type ProjectAction =
  /** Not undoable. Clears history. Used when a saved project is loaded. */
  | { type: 'project/replace'; project: ProjectDocument }
  | { type: 'source/set'; source: ProjectSource }
  /** Not undoable, does not bump revision. Playback URL is ephemeral. */
  | { type: 'source/updateUrl'; fileUrl: string }
  | { type: 'trim/set'; startMs: number; endMs: number }
  | { type: 'captions/replaceAll'; captions: CaptionRow[]; sourceLanguage?: string }
  | { type: 'captions/applyTranslations'; translations: Array<{ id: string; text: string }> }
  | { type: 'caption/update'; id: string; patch: CaptionTimingPatch; now?: number }
  | { type: 'caption/insert'; atMs: number; durationMs?: number }
  | { type: 'caption/split'; id: string; atMs: number }
  | { type: 'caption/mergeWithNext'; id: string }
  | { type: 'caption/delete'; id: string }
  | { type: 'caption/nudge'; id: string; deltaMs: number; edge: NudgeEdge }
  | { type: 'style/set'; patch: Partial<Omit<SubtitleStyle, 'presetId'>> }
  | { type: 'style/applyPreset'; presetId: SubtitlePresetId }
  | { type: 'languages/set'; sourceLanguage?: string; targetLanguage?: string }
  | { type: 'previewTrack/set'; track: PreviewTrack }
  | { type: 'history/undo' }
  | { type: 'history/redo' };

export type CreateEmptyProjectOptions = {
  targetLanguage: string;
  style?: SubtitleStyle;
};

type EditOptions = {
  coalesceKey?: string;
  /** Epoch ms used for updatedAt and coalescing. Defaults to Date.now(). */
  at?: number;
};

export function createEmptyProject({ targetLanguage, style }: CreateEmptyProjectOptions): ProjectDocument {
  return {
    schemaVersion: 1,
    id: createId(),
    source: null,
    trim: { startMs: 0, endMs: 0 },
    targetLanguage,
    captions: [],
    style: { ...(style ?? DEFAULT_SUBTITLE_STYLE) },
    previewTrack: 'translation',
    updatedAt: new Date().toISOString()
  };
}

export function createProjectState(project: ProjectDocument): ProjectState {
  return { project, past: [], future: [], revision: 0 };
}

export function projectReducer(state: ProjectState, action: ProjectAction): ProjectState {
  const project = state.project;

  switch (action.type) {
    case 'project/replace':
      return { project: action.project, past: [], future: [], revision: state.revision + 1 };

    case 'source/updateUrl': {
      if (!project.source || project.source.fileUrl === action.fileUrl) return state;
      return { ...state, project: { ...project, source: { ...project.source, fileUrl: action.fileUrl } } };
    }

    case 'source/set': {
      const source = { ...action.source, durationMs: toMs(action.source.durationMs) };
      const next: ProjectDocument = {
        ...project,
        source,
        trim: { startMs: 0, endMs: source.durationMs },
        captions: []
      };
      delete next.sourceLanguage;
      return applyEdit(state, next);
    }

    case 'trim/set': {
      if (!project.source) return state;
      const trim = normalizeTrim(action.startMs, action.endMs, project.source.durationMs);
      if (!trim || isShallowEqual(trim, project.trim)) return state;
      return applyEdit(state, { ...project, trim });
    }

    case 'captions/replaceAll': {
      const next: ProjectDocument = { ...project, captions: sortCaptions(action.captions.map(normalizeCaptionTiming)) };
      if (action.sourceLanguage !== undefined) next.sourceLanguage = action.sourceLanguage;
      return applyEdit(state, next);
    }

    case 'captions/applyTranslations': {
      const translations = new Map(action.translations.map((item): [string, string] => [item.id, item.text]));
      let changed = false;
      const captions = project.captions.map((caption) => {
        const text = translations.get(caption.id);
        if (text === undefined || text === caption.translation) return caption;
        changed = true;
        return { ...caption, translation: text };
      });
      return changed ? applyEdit(state, { ...project, captions }) : state;
    }

    case 'caption/update': {
      const index = findCaptionIndex(project.captions, action.id);
      if (index < 0) return state;
      const current = project.captions[index];
      const updated = applyCaptionPatch(current, action.patch);
      if (isShallowEqual(current, updated)) return state;

      const timingChanged = action.patch.startMs !== undefined || action.patch.endMs !== undefined;
      const textFields = (['original', 'translation'] as const).filter((field) => action.patch[field] !== undefined);
      const coalesceKey =
        !timingChanged && textFields.length > 0 ? `caption-text:${action.id}:${textFields.join(',')}` : undefined;

      const captions = sortCaptions(replaceAt(project.captions, index, updated));
      return applyEdit(state, { ...project, captions }, { coalesceKey, at: action.now ?? Date.now() });
    }

    case 'caption/insert': {
      const atMs = toMs(action.atMs);
      const gap = findFreeGap(project, atMs);
      if (!gap || gap.end - atMs < MIN_INSERT_ROOM_MS) return state;
      const durationMs = Math.max(1, toMs(action.durationMs ?? DEFAULT_CAPTION_MS));
      const caption: CaptionRow = {
        id: createId(),
        startMs: atMs,
        endMs: Math.min(atMs + durationMs, gap.end),
        original: '',
        translation: ''
      };
      return applyEdit(state, { ...project, captions: sortCaptions([...project.captions, caption]) });
    }

    case 'caption/split': {
      const index = findCaptionIndex(project.captions, action.id);
      if (index < 0) return state;
      const caption = project.captions[index];
      const atMs = toMs(action.atMs);
      if (atMs <= caption.startMs || atMs >= caption.endMs) return state;

      const ratio = (atMs - caption.startMs) / (caption.endMs - caption.startMs);
      const [originalFirst, originalSecond] = splitTextAtRatio(caption.original, ratio);
      const [translationFirst, translationSecond] = splitTextAtRatio(caption.translation, ratio);
      const first: CaptionRow = {
        ...caption,
        endMs: atMs,
        original: originalFirst,
        translation: translationFirst
      };
      const second: CaptionRow = {
        id: createId(),
        startMs: atMs,
        endMs: caption.endMs,
        original: originalSecond,
        translation: translationSecond
      };
      const captions = sortCaptions([...project.captions.slice(0, index), first, second, ...project.captions.slice(index + 1)]);
      return applyEdit(state, { ...project, captions });
    }

    case 'caption/mergeWithNext': {
      const index = findCaptionIndex(project.captions, action.id);
      if (index < 0 || index >= project.captions.length - 1) return state;
      const current = project.captions[index];
      const next = project.captions[index + 1];
      const merged: CaptionRow = {
        ...current,
        endMs: next.endMs,
        original: joinText(current.original, next.original),
        translation: joinText(current.translation, next.translation)
      };
      const captions = [...project.captions.slice(0, index), merged, ...project.captions.slice(index + 2)];
      return applyEdit(state, { ...project, captions });
    }

    case 'caption/delete': {
      const captions = project.captions.filter((caption) => caption.id !== action.id);
      if (captions.length === project.captions.length) return state;
      return applyEdit(state, { ...project, captions });
    }

    case 'caption/nudge': {
      const index = findCaptionIndex(project.captions, action.id);
      if (index < 0) return state;
      const delta = Number.isFinite(action.deltaMs) ? Math.round(action.deltaMs) : 0;
      if (delta === 0) return state;

      const current = project.captions[index];
      let startMs = current.startMs;
      let endMs = current.endMs;
      if (action.edge === 'start') {
        startMs = Math.max(0, startMs + delta);
      } else if (action.edge === 'end') {
        endMs = Math.max(0, endMs + delta);
      } else {
        const shift = Math.max(delta, -current.startMs);
        startMs += shift;
        endMs = Math.max(0, endMs + shift);
      }

      const updated: CaptionRow = { ...current, startMs, endMs };
      if (isShallowEqual(current, updated)) return state;
      const captions = sortCaptions(replaceAt(project.captions, index, updated));
      return applyEdit(state, { ...project, captions });
    }

    case 'style/set': {
      const changes = withoutUndefined(action.patch) as Partial<SubtitleStyle>;
      const keys = Object.keys(changes) as Array<keyof SubtitleStyle>;
      const changed = keys.some((key) => project.style[key] !== changes[key]);
      if (!changed) return state;
      const style: SubtitleStyle = { ...project.style, ...changes };
      // Any real change means the style no longer matches the named preset.
      delete style.presetId;
      return applyEdit(state, { ...project, style });
    }

    case 'style/applyPreset': {
      const style: SubtitleStyle = { ...SUBTITLE_PRESETS[action.presetId] };
      if (isShallowEqual(style, project.style)) return state;
      return applyEdit(state, { ...project, style });
    }

    case 'languages/set': {
      const next: ProjectDocument = { ...project };
      if (action.sourceLanguage !== undefined) next.sourceLanguage = action.sourceLanguage;
      if (action.targetLanguage !== undefined) next.targetLanguage = action.targetLanguage;
      if (next.sourceLanguage === project.sourceLanguage && next.targetLanguage === project.targetLanguage) return state;
      return applyEdit(state, next);
    }

    case 'previewTrack/set': {
      if (project.previewTrack === action.track) return state;
      return applyEdit(state, { ...project, previewTrack: action.track });
    }

    case 'history/undo': {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        project: { ...restoreFileUrl(previous, project), updatedAt: new Date().toISOString() },
        past: state.past.slice(0, -1),
        future: [project, ...state.future].slice(0, HISTORY_LIMIT),
        revision: state.revision + 1
      };
    }

    case 'history/redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        project: { ...restoreFileUrl(next, project), updatedAt: new Date().toISOString() },
        past: [...state.past, project].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        revision: state.revision + 1
      };
    }
  }

  // Unreachable while the union is exhaustive; keeps the reducer total at runtime.
  const exhaustive: never = action;
  void exhaustive;
  return state;
}

function applyEdit(state: ProjectState, next: ProjectDocument, options: EditOptions = {}): ProjectState {
  const at = options.at ?? Date.now();
  const coalesced =
    options.coalesceKey !== undefined &&
    state.lastCoalesceKey === options.coalesceKey &&
    state.lastCoalesceAt !== undefined &&
    at - state.lastCoalesceAt <= COALESCE_WINDOW_MS;

  return {
    project: { ...next, updatedAt: new Date(at).toISOString() },
    past: coalesced ? state.past : [...state.past, state.project].slice(-HISTORY_LIMIT),
    future: [],
    revision: state.revision + 1,
    lastCoalesceKey: options.coalesceKey,
    lastCoalesceAt: options.coalesceKey === undefined ? undefined : at
  };
}

/** Undo/redo snapshots store the fileUrl that was current at the time. Keep the live URL when it is the same file. */
function restoreFileUrl(snapshot: ProjectDocument, current: ProjectDocument): ProjectDocument {
  if (!snapshot.source || !current.source || snapshot.source.inputPath !== current.source.inputPath) return snapshot;
  return { ...snapshot, source: { ...snapshot.source, fileUrl: current.source.fileUrl } };
}

function normalizeTrim(startMs: number, endMs: number, durationMs: number): TrimRange | null {
  const duration = toMs(durationMs);
  const start = clamp(toMs(startMs), 0, duration);
  const end = clamp(toMs(endMs), 0, duration);
  // Too-short or inverted ranges are rejected (no-op) rather than adjusted.
  if (end - start < MIN_TRIM_MS) return null;
  return { startMs: start, endMs: end };
}

/**
 * Free range around atMs, bounded by the trim range and neighbouring captions.
 * Returns null when atMs sits inside a caption or outside the trim.
 */
function findFreeGap(project: ProjectDocument, atMs: number): { start: number; end: number } | null {
  let start = project.trim.startMs;
  let end = project.trim.endMs;
  for (const caption of project.captions) {
    if (caption.startMs <= atMs) {
      start = Math.max(start, caption.endMs);
    } else {
      end = Math.min(end, caption.startMs);
    }
  }
  if (atMs < start || atMs >= end) return null;
  return { start, end };
}

/**
 * Splits text at the word boundary whose character position is nearest to
 * `ratio` of the text length. Newlines are collapsed to spaces first, so both
 * halves are single-line. Text without a boundary stays in the first half.
 */
function splitTextAtRatio(text: string, ratio: number): [string, string] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized === '') return ['', ''];

  const boundaries: number[] = [];
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] === ' ') boundaries.push(index);
  }
  if (boundaries.length === 0) return [normalized, ''];

  const target = clamp(ratio, 0, 1) * normalized.length;
  let best = boundaries[0];
  for (const position of boundaries) {
    if (Math.abs(position - target) < Math.abs(best - target)) best = position;
  }
  return [normalized.slice(0, best), normalized.slice(best + 1)];
}

function joinText(first: string, second: string): string {
  return [first.trim(), second.trim()].filter((part) => part !== '').join(' ');
}

function applyCaptionPatch(caption: CaptionRow, patch: CaptionTimingPatch): CaptionRow {
  return {
    ...caption,
    startMs: patch.startMs === undefined ? caption.startMs : toMs(patch.startMs),
    endMs: patch.endMs === undefined ? caption.endMs : toMs(patch.endMs),
    original: patch.original ?? caption.original,
    translation: patch.translation ?? caption.translation
  };
}

function normalizeCaptionTiming(caption: CaptionRow): CaptionRow {
  return { ...caption, startMs: toMs(caption.startMs), endMs: toMs(caption.endMs) };
}

function sortCaptions(captions: CaptionRow[]): CaptionRow[] {
  return [...captions].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
}

function findCaptionIndex(captions: CaptionRow[], id: string): number {
  return captions.findIndex((caption) => caption.id === id);
}

function replaceAt<T>(items: T[], index: number, item: T): T[] {
  return items.map((current, currentIndex) => (currentIndex === index ? item : current));
}

function toMs(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function isShallowEqual(a: object, b: object): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  return aKeys.every((key) => left[key] === right[key]);
}

function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>;
}

function createId(): string {
  return crypto.randomUUID();
}
