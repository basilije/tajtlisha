import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useZoomShortcuts } from '../../../src/renderer/src/hooks/useZoomShortcuts';

function mountZoom(zoomPercent = 100, enabled = true) {
  const onZoomChange = vi.fn();
  const hook = renderHook((props: { zoomPercent: number }) => useZoomShortcuts({ zoomPercent: props.zoomPercent, onZoomChange, enabled }), {
    initialProps: { zoomPercent }
  });
  return { onZoomChange, hook };
}

describe('useZoomShortcuts', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('steps up on Ctrl+= and persists the next level', () => {
    const { onZoomChange } = mountZoom(100);
    fireEvent.keyDown(document.body, { key: '=', ctrlKey: true });
    expect(onZoomChange).toHaveBeenCalledWith(105);
  });

  it('steps up on Ctrl+Shift+= (the + character on US layouts)', () => {
    const { onZoomChange } = mountZoom(100);
    fireEvent.keyDown(document.body, { key: '+', code: 'Equal', ctrlKey: true, shiftKey: true });
    expect(onZoomChange).toHaveBeenCalledWith(105);
  });

  it('steps down on Ctrl+- and on the numpad minus key', () => {
    const { onZoomChange } = mountZoom(100);
    fireEvent.keyDown(document.body, { key: '-', ctrlKey: true });
    expect(onZoomChange).toHaveBeenLastCalledWith(95);
    fireEvent.keyDown(document.body, { key: 'Subtract', code: 'NumpadSubtract', ctrlKey: true });
    expect(onZoomChange).toHaveBeenCalledTimes(2);
  });

  it('matches Meta as the modifier as well', () => {
    const { onZoomChange } = mountZoom(100);
    fireEvent.keyDown(document.body, { key: '=', metaKey: true });
    expect(onZoomChange).toHaveBeenCalledWith(105);
  });

  it('resets to 100% on Ctrl+0 from any level', () => {
    const { onZoomChange } = mountZoom(130);
    fireEvent.keyDown(document.body, { key: '0', ctrlKey: true });
    expect(onZoomChange).toHaveBeenCalledWith(100);
  });

  it('works while focus is inside a text field', () => {
    const { onZoomChange } = mountZoom(100);
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    document.body.append(input, textarea);

    fireEvent.keyDown(input, { key: '=', ctrlKey: true });
    fireEvent.keyDown(textarea, { key: '0', ctrlKey: true });
    expect(onZoomChange.mock.calls).toEqual([[105], [100]]);
  });

  it('ignores plain + and - without Ctrl, and Ctrl combined with Alt', () => {
    const { onZoomChange } = mountZoom(100);
    fireEvent.keyDown(document.body, { key: '+' });
    fireEvent.keyDown(document.body, { key: '-' });
    fireEvent.keyDown(document.body, { key: '=', ctrlKey: true, altKey: true });
    expect(onZoomChange).not.toHaveBeenCalled();
  });

  it('does nothing at the ends of the range and while disabled', () => {
    const top = mountZoom(150);
    fireEvent.keyDown(document.body, { key: '=', ctrlKey: true });
    expect(top.onZoomChange).not.toHaveBeenCalled();
    top.hook.unmount();

    const disabled = mountZoom(100, false);
    fireEvent.keyDown(document.body, { key: '=', ctrlKey: true });
    expect(disabled.onZoomChange).not.toHaveBeenCalled();
  });

  it('builds on the previous press when presses arrive before a re-render', () => {
    const { onZoomChange } = mountZoom(100);
    fireEvent.keyDown(document.body, { key: '=', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: '=', ctrlKey: true });
    expect(onZoomChange.mock.calls).toEqual([[105], [110]]);
  });
});
