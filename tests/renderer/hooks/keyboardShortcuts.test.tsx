import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '../../../src/renderer/src/hooks/useKeyboardShortcuts';

function mountWithControl(role?: string) {
  const handler = vi.fn();
  renderHook(() => useKeyboardShortcuts([{ key: ' ', handler }]));
  const control = document.createElement(role === 'div' ? 'div' : 'button');
  if (role && role !== 'div') control.setAttribute('role', role);
  if (role === 'div') control.setAttribute('role', 'slider');
  document.body.appendChild(control);
  return { handler, control };
}

describe('useKeyboardShortcuts focus handling', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('plays on Space when focus is on the body', () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts([{ key: ' ', handler }]));
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('leaves Space to a focused button, link, checkbox, switch and slider', () => {
    for (const role of [undefined, 'checkbox', 'switch', 'slider']) {
      const { handler, control } = mountWithControl(role);
      fireEvent.keyDown(control, { key: ' ' });
      expect(handler).not.toHaveBeenCalled();
      document.body.innerHTML = '';
    }

    const link = document.createElement('a');
    link.href = '#x';
    document.body.appendChild(link);
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts([{ key: ' ', handler }]));
    fireEvent.keyDown(link, { key: ' ' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('still runs Ctrl/Meta shortcuts while a button has focus', () => {
    const open = vi.fn();
    renderHook(() => useKeyboardShortcuts([{ key: 'o', ctrlOrMeta: true, handler: open }]));
    const button = document.createElement('button');
    document.body.appendChild(button);
    fireEvent.keyDown(button, { key: 'o', ctrlKey: true });
    expect(open).toHaveBeenCalledTimes(1);
  });
});
