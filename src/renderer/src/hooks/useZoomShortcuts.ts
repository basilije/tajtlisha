import { useEffect, useRef } from 'react';
import { DEFAULT_UI_ZOOM_PERCENT, normalizeUiZoom, stepUiZoom } from '../../../shared/ui-zoom';

export type ZoomShortcutOptions = {
  /** Current zoom in percent, as stored in settings. */
  zoomPercent: number;
  /** Receives the new zoom in percent. Only called when the level changes. */
  onZoomChange: (zoomPercent: number) => void;
  /** False until settings are loaded, so a key press cannot overwrite the saved value. */
  enabled: boolean;
};

type ZoomAction = 'in' | 'out' | 'reset';

/**
 * Ctrl (Meta on macOS) with +, - or 0. The key character comes first, then the
 * physical key code, so the keys also work on layouts where + and - sit elsewhere.
 */
function zoomActionFor(event: KeyboardEvent): ZoomAction | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  if (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd' || event.code === 'Equal') return 'in';
  if (event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract' || event.code === 'Minus') return 'out';
  if (event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0') return 'reset';
  return null;
}

/**
 * Window-level zoom shortcuts. Unlike useKeyboardShortcuts this also runs while
 * focus is in a text field, because Ctrl + is not text input. The latest zoom is
 * kept in a ref so quick repeated presses each build on the previous one.
 */
export function useZoomShortcuts({ zoomPercent, onZoomChange, enabled }: ZoomShortcutOptions): void {
  const latest = useRef({ zoomPercent: normalizeUiZoom(zoomPercent), onZoomChange, enabled });
  latest.current = { zoomPercent: normalizeUiZoom(zoomPercent), onZoomChange, enabled };

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const action = zoomActionFor(event);
      const current = latest.current;
      if (!action || !current.enabled || event.defaultPrevented) return;
      event.preventDefault();

      const next = action === 'reset' ? DEFAULT_UI_ZOOM_PERCENT : stepUiZoom(current.zoomPercent, action === 'in' ? 1 : -1);
      if (next === current.zoomPercent) return;
      current.zoomPercent = next;
      current.onZoomChange(next);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
