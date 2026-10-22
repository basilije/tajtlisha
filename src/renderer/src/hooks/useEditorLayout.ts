import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import {
  DEFAULT_CAPTIONS_FRACTION,
  DEFAULT_EDITOR_LAYOUT,
  captionsFractionFor,
  captionsWidthBounds,
  captionsWidthPx,
  clampStyleDrawerPx,
  loadEditorLayout,
  saveEditorLayout,
  styleDrawerBounds,
  styleDrawerPx,
  type EditorLayout
} from './editorLayout';

/** One resizable size: the current value, its allowed range and the actions the splitter needs. */
export type SplitSize = {
  value: number;
  min: number;
  max: number;
  /** Sets the size for the current drag or key step. Clamped here, not persisted. */
  set: (value: number) => void;
  /** Persists the current size. Called on drag end and after each key step. */
  commit: () => void;
  reset: () => void;
};

export type EditorLayoutControls = {
  workspaceRef: RefObject<HTMLDivElement | null>;
  sideRef: RefObject<HTMLElement | null>;
  /** False until the workspace has a width. Until then the grid uses its CSS fallback. */
  measured: boolean;
  captions: SplitSize;
  styleDrawer: SplitSize;
};

type Measured = { width: number; height: number };

function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Editor split sizes. The layout is read from storage once on mount. Sizes are
 * kept in state while a drag is in progress and written to storage only on commit.
 * Sizes are measured with ResizeObserver so the clamps follow window resizes.
 */
export function useEditorLayout(): EditorLayoutControls {
  const [layout, setLayoutState] = useState<EditorLayout>(() => loadEditorLayout(browserStorage()));
  const layoutRef = useRef(layout);

  const workspaceRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLElement>(null);
  const [measured, setMeasured] = useState<Measured>({ width: 0, height: 0 });
  const measuredRef = useRef(measured);

  useLayoutEffect(() => {
    // Fixed parts of the side column: the preview head, the trim bar and the
    // two column gaps around the preview. The rest is shared by the video,
    // the splitter and the drawer.
    function fixedSideHeight(side: HTMLElement): number {
      const head = side.querySelector('.editor-preview-head')?.getBoundingClientRect().height ?? 0;
      const trim = side.querySelector('.editor-trim')?.getBoundingClientRect().height ?? 0;
      const gap = Number.parseFloat(getComputedStyle(side).rowGap) || 0;
      return head + trim + 2 * gap;
    }

    function measure(): void {
      const workspace = workspaceRef.current?.getBoundingClientRect();
      const side = sideRef.current;
      const sideHeight = side ? Math.max(0, side.getBoundingClientRect().height - fixedSideHeight(side)) : 0;
      const next = { width: workspace?.width ?? 0, height: sideHeight };
      measuredRef.current = next;
      setMeasured((current) =>
        current.width === next.width && current.height === next.height ? current : next
      );
    }

    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(measure);
    if (workspaceRef.current) observer.observe(workspaceRef.current);
    if (sideRef.current) {
      observer.observe(sideRef.current);
      // The trim bar appears once a clip is loaded and changes the room left for the drawer.
      for (const part of sideRef.current.querySelectorAll('.editor-preview-head, .editor-trim')) observer.observe(part);
    }
    return () => observer.disconnect();
  }, []);

  const applyLayout = useCallback((next: EditorLayout) => {
    layoutRef.current = next;
    setLayoutState(next);
  }, []);

  const persist = useCallback(() => {
    saveEditorLayout(browserStorage(), layoutRef.current);
  }, []);

  const { width, height } = measured;
  const captionsBounds = captionsWidthBounds(width);
  const drawerBounds = styleDrawerBounds(height);

  const captions: SplitSize = {
    value: captionsWidthPx(layout.captionsFraction, width),
    min: captionsBounds.min,
    max: captionsBounds.max,
    set: (widthPx) => {
      if (measuredRef.current.width <= 0) return;
      applyLayout({
        ...layoutRef.current,
        captionsFraction: captionsFractionFor(widthPx, measuredRef.current.width)
      });
    },
    commit: persist,
    reset: () => {
      applyLayout({ ...layoutRef.current, captionsFraction: DEFAULT_CAPTIONS_FRACTION });
      persist();
    }
  };

  const styleDrawer: SplitSize = {
    value: styleDrawerPx(layout.styleDrawerPx, height),
    min: drawerBounds.min,
    max: drawerBounds.max,
    set: (heightPx) => {
      applyLayout({
        ...layoutRef.current,
        styleDrawerPx: clampStyleDrawerPx(heightPx, measuredRef.current.height)
      });
    },
    commit: persist,
    reset: () => {
      applyLayout({ ...layoutRef.current, styleDrawerPx: DEFAULT_EDITOR_LAYOUT.styleDrawerPx });
      persist();
    }
  };

  return {
    workspaceRef,
    sideRef,
    measured: width > 0,
    captions,
    styleDrawer
  };
}
