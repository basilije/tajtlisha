import { useEffect, useRef } from 'react';

export type Shortcut = {
  /** KeyboardEvent.key, compared case-insensitively for letters (for example ' ', 'ArrowLeft', 'z'). */
  key: string;
  ctrlOrMeta?: boolean;
  shift?: boolean;
  handler: () => void;
};

/** Text fields keep their native behaviour, including their own undo stack. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** True while a modal dialog is open. Shortcuts for the editor pause then. */
function hasOpenDialog(): boolean {
  return document.querySelector('[role="dialog"][data-state="open"]') !== null;
}

function matches(shortcut: Shortcut, event: KeyboardEvent): boolean {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const expectedKey = shortcut.key.length === 1 ? shortcut.key.toLowerCase() : shortcut.key;
  if (key !== expectedKey) return false;
  if (Boolean(shortcut.ctrlOrMeta) !== (event.ctrlKey || event.metaKey)) return false;
  return Boolean(shortcut.shift) === event.shiftKey;
}

/**
 * Window-level shortcuts. Ignored while focus is in a text field and while a
 * dialog is open. The first matching shortcut wins; its default action is prevented.
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[], options: { dialogsBlock?: boolean } = {}): void {
  const latest = useRef({ shortcuts, options });
  latest.current = { shortcuts, options };

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;
      if (latest.current.options.dialogsBlock !== false && hasOpenDialog()) return;

      const shortcut = latest.current.shortcuts.find((candidate) => matches(candidate, event));
      if (!shortcut) return;
      event.preventDefault();
      shortcut.handler();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
