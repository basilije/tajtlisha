/**
 * Editor layout sizes: the captions/preview split and the subtitle style drawer
 * height. Pure functions only, so the clamping and storage rules can be tested
 * without React. These are UI preferences, never secrets.
 */

export const EDITOR_LAYOUT_STORAGE_KEY = 'tajtlisha.editorLayout.v1';

/** Width of the vertical splitter track and height of the horizontal one. Same as the old column gap. */
export const SPLITTER_PX = 12;

export const DEFAULT_CAPTIONS_FRACTION = 0.58;
/** The captions column keeps at least this width unless the window cannot fit both minimums. */
export const MIN_CAPTIONS_PX = 420;
export const MIN_PREVIEW_PX = 320;

/** Default drawer height as a share of the side column height. */
export const DEFAULT_STYLE_DRAWER_SHARE = 0.4;
export const MIN_STYLE_DRAWER_PX = 140;
/** Height above the drawer splitter (preview head, video, trim bar) that always stays visible. */
export const MIN_VIDEO_AREA_PX = 200;

export const SPLITTER_STEP_PX = 16;
export const SPLITTER_LARGE_STEP_PX = 64;

const MAX_STORED_DRAWER_PX = 10_000;

export type EditorLayout = {
  /** Captions column width as a share of the workspace width, so window resizes keep the proportions. */
  captionsFraction: number;
  /** Explicit drawer height in px. Null until the user resizes it; the default share applies until then. */
  styleDrawerPx: number | null;
};

export const DEFAULT_EDITOR_LAYOUT: EditorLayout = {
  captionsFraction: DEFAULT_CAPTIONS_FRACTION,
  styleDrawerPx: null
};

export type LayoutRange = { min: number; max: number };

type LayoutStorage = Pick<Storage, 'getItem' | 'setItem'>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Width left for the two columns once the splitter track is taken out. */
function availableWidth(workspaceWidthPx: number): number {
  return Math.max(0, workspaceWidthPx - SPLITTER_PX);
}

/**
 * Allowed captions width. The captions minimum gives way when the window is too
 * narrow for both minimums, so the preview keeps its own minimum first.
 */
export function captionsWidthBounds(workspaceWidthPx: number): LayoutRange {
  const max = Math.max(0, availableWidth(workspaceWidthPx) - MIN_PREVIEW_PX);
  return { min: Math.min(MIN_CAPTIONS_PX, max), max };
}

/** Captions column width in px for a stored fraction, clamped to the bounds. */
export function captionsWidthPx(fraction: number, workspaceWidthPx: number): number {
  const { min, max } = captionsWidthBounds(workspaceWidthPx);
  return Math.round(clamp(fraction * availableWidth(workspaceWidthPx), min, max));
}

/** Fraction to store after the captions column was dragged to `widthPx`. Clamped first. */
export function captionsFractionFor(widthPx: number, workspaceWidthPx: number): number {
  const available = availableWidth(workspaceWidthPx);
  if (available <= 0) return DEFAULT_CAPTIONS_FRACTION;
  const { min, max } = captionsWidthBounds(workspaceWidthPx);
  return clamp(Math.round(widthPx), min, max) / available;
}

export function styleDrawerBounds(columnHeightPx: number): LayoutRange {
  return {
    min: MIN_STYLE_DRAWER_PX,
    max: Math.max(MIN_STYLE_DRAWER_PX, columnHeightPx - MIN_VIDEO_AREA_PX - SPLITTER_PX)
  };
}

/** Clamps a requested drawer height so the video area above it keeps its minimum. */
export function clampStyleDrawerPx(heightPx: number, columnHeightPx: number): number {
  const { min, max } = styleDrawerBounds(columnHeightPx);
  return Math.round(clamp(heightPx, min, max));
}

/** Drawer height in px: the stored size, or the default share of the column when none is stored. */
export function styleDrawerPx(stored: number | null, columnHeightPx: number): number {
  return clampStyleDrawerPx(stored ?? columnHeightPx * DEFAULT_STYLE_DRAWER_SHARE, columnHeightPx);
}

function isNumberIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

/** Reads stored JSON. Anything malformed or out of range falls back to the default for that field. */
export function parseEditorLayout(raw: string | null): EditorLayout {
  if (raw === null) return { ...DEFAULT_EDITOR_LAYOUT };

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_EDITOR_LAYOUT };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { ...DEFAULT_EDITOR_LAYOUT };

  const { captionsFraction, styleDrawerPx: drawerPx } = data as Record<string, unknown>;
  return {
    captionsFraction: isNumberIn(captionsFraction, 0, 1) ? captionsFraction : DEFAULT_CAPTIONS_FRACTION,
    styleDrawerPx: isNumberIn(drawerPx, 1, MAX_STORED_DRAWER_PX) ? drawerPx : null
  };
}

/** Reads the layout from storage. A missing or throwing storage gives the defaults. */
export function loadEditorLayout(storage: LayoutStorage | undefined): EditorLayout {
  if (!storage) return { ...DEFAULT_EDITOR_LAYOUT };
  try {
    return parseEditorLayout(storage.getItem(EDITOR_LAYOUT_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_EDITOR_LAYOUT };
  }
}

/** Writes the layout to storage. A full or disabled storage just means the layout is not remembered. */
export function saveEditorLayout(storage: LayoutStorage | undefined, layout: EditorLayout): void {
  if (!storage) return;
  const stored: EditorLayout = { captionsFraction: layout.captionsFraction, styleDrawerPx: layout.styleDrawerPx };
  try {
    storage.setItem(EDITOR_LAYOUT_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Not remembered; the layout still works for this session.
  }
}
