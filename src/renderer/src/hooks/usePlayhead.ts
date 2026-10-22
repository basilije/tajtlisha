import { useCallback, useEffect, useRef, useState } from 'react';

/** Table highlight and overlay state are throttled to this rate. The ref is always exact. */
export const PLAYHEAD_RENDER_INTERVAL_MS = 1000 / 15;

export type Playhead = {
  /** Exact source-absolute time, updated on every report. Read it in event handlers. */
  timeRef: { readonly current: number };
  /** Throttled copy (about 15 fps) for rendering. */
  timeMs: number;
  report: (ms: number) => void;
};

/** Keeps the playhead exact in a ref and a throttled state copy for rendering. */
export function usePlayhead(initialMs: number): Playhead {
  const timeRef = useRef(initialMs);
  const [timeMs, setTimeMs] = useState(initialMs);
  const lastRenderRef = useRef(Number.NEGATIVE_INFINITY);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const report = useCallback((ms: number) => {
    timeRef.current = ms;
    const now = performance.now();
    const elapsed = now - lastRenderRef.current;
    if (elapsed >= PLAYHEAD_RENDER_INTERVAL_MS) {
      lastRenderRef.current = now;
      setTimeMs(ms);
      return;
    }
    if (timerRef.current === null) {
      // Trailing update so the last position is always rendered.
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        lastRenderRef.current = performance.now();
        setTimeMs(timeRef.current);
      }, PLAYHEAD_RENDER_INTERVAL_MS - elapsed);
    }
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    []
  );

  return { timeRef, timeMs, report };
}
