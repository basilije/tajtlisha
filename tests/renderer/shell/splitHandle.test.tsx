import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SplitHandle, type SplitHandleProps } from '../../../src/renderer/src/components/shell/SplitHandle';
import { useKeyboardShortcuts } from '../../../src/renderer/src/hooks/useKeyboardShortcuts';

// jsdom has no pointer capture. The handle only needs the calls to exist.
beforeAll(() => {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => true);
});

afterEach(() => {
  cleanup();
  document.body.className = '';
});

// jsdom has no PointerEvent, so pointer events are MouseEvents with the right type and coordinates.
function pointer(type: string, init: { clientX?: number; clientY?: number } = {}): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });
}

function renderHandle(overrides: Partial<SplitHandleProps> = {}) {
  const props: SplitHandleProps = {
    orientation: 'vertical',
    label: 'Resize captions and preview',
    value: 500,
    min: 420,
    max: 668,
    onValueChange: vi.fn(),
    onValueCommit: vi.fn(),
    onReset: vi.fn(),
    ...overrides
  };
  render(<SplitHandle {...props} />);
  return { props, handle: screen.getByRole('separator', { name: props.label }) };
}

describe('SplitHandle', () => {
  it('is a focusable separator with an accessible name and value range', () => {
    const { handle } = renderHandle();

    expect(handle).toHaveAttribute('aria-orientation', 'vertical');
    expect(handle).toHaveAttribute('aria-valuenow', '500');
    expect(handle).toHaveAttribute('aria-valuemin', '420');
    expect(handle).toHaveAttribute('aria-valuemax', '668');
    expect(handle).toHaveAttribute('tabindex', '0');
  });

  it('moves a vertical handle left and right by 16 px, or 64 px with Shift', () => {
    const { props, handle } = renderHandle();

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(props.onValueChange).toHaveBeenLastCalledWith(516);
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(props.onValueChange).toHaveBeenLastCalledWith(484);
    fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true });
    expect(props.onValueChange).toHaveBeenLastCalledWith(564);

    expect(props.onValueCommit).toHaveBeenCalledTimes(3);
  });

  it('ignores the arrow keys of the other axis', () => {
    const { props, handle } = renderHandle();

    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    fireEvent.keyDown(handle, { key: 'ArrowDown' });

    expect(props.onValueChange).not.toHaveBeenCalled();
    expect(props.onValueCommit).not.toHaveBeenCalled();
  });

  it('jumps to the range ends with Home and End', () => {
    const { props, handle } = renderHandle();

    fireEvent.keyDown(handle, { key: 'Home' });
    expect(props.onValueChange).toHaveBeenLastCalledWith(420);
    fireEvent.keyDown(handle, { key: 'End' });
    expect(props.onValueChange).toHaveBeenLastCalledWith(668);
  });

  it('moves a horizontal handle with the arrow keys of its axis', () => {
    const { props, handle } = renderHandle({ orientation: 'horizontal', label: 'Resize', value: 300 });

    fireEvent.keyDown(handle, { key: 'ArrowDown' });
    expect(props.onValueChange).toHaveBeenLastCalledWith(316);
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(props.onValueChange).toHaveBeenLastCalledWith(284);
  });

  it('grows a reversed handle when it moves up', () => {
    const { props, handle } = renderHandle({ orientation: 'horizontal', reverse: true, label: 'Resize', value: 300 });

    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(props.onValueChange).toHaveBeenLastCalledWith(316);
  });

  it('keeps arrow keys away from window-level listeners', () => {
    const { handle } = renderHandle();
    const windowListener = vi.fn();
    window.addEventListener('keydown', windowListener);

    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    fireEvent.keyDown(handle, { key: 'Home' });

    window.removeEventListener('keydown', windowListener);
    expect(windowListener).not.toHaveBeenCalled();
  });

  it('does not run editor shortcuts while it has focus', () => {
    const frameStep = vi.fn();

    function Harness() {
      useKeyboardShortcuts([{ key: 'ArrowRight', handler: frameStep }]);
      return <SplitHandle orientation="vertical" label="Resize" value={500} min={420} max={668} onValueChange={vi.fn()} onValueCommit={vi.fn()} onReset={vi.fn()} />;
    }
    render(<Harness />);

    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' });
    expect(frameStep).not.toHaveBeenCalled();
  });

  it('lets playback keys it does not use reach the editor shortcuts', () => {
    const toggle = vi.fn();

    function Harness() {
      useKeyboardShortcuts([{ key: ' ', handler: toggle }]);
      return <SplitHandle orientation="vertical" label="Resize" value={500} min={420} max={668} onValueChange={vi.fn()} onValueCommit={vi.fn()} onReset={vi.fn()} />;
    }
    render(<Harness />);

    // Focus stays on the handle after a drag; Space must still play or pause.
    const handle = screen.getByRole('separator');
    handle.focus();
    fireEvent.keyDown(handle, { key: ' ' });
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('drags a vertical handle by the pointer distance and commits once on release', () => {
    const { props, handle } = renderHandle();

    fireEvent(handle, pointer('pointerdown', { clientX: 100 }));
    expect(document.body).toHaveClass('is-resizing-col');
    expect(handle).toHaveClass('is-dragging');

    fireEvent(handle, pointer('pointermove', { clientX: 130 }));
    expect(props.onValueChange).toHaveBeenLastCalledWith(530);
    fireEvent(handle, pointer('pointermove', { clientX: 60 }));
    expect(props.onValueChange).toHaveBeenLastCalledWith(460);
    expect(props.onValueCommit).not.toHaveBeenCalled();

    fireEvent(handle, pointer('pointerup', { clientX: 60 }));
    expect(props.onValueCommit).toHaveBeenCalledTimes(1);
    expect(document.body).not.toHaveClass('is-resizing-col');
    expect(handle).not.toHaveClass('is-dragging');
  });

  it('ignores pointer moves that are not part of a drag', () => {
    const { props, handle } = renderHandle();

    fireEvent(handle, pointer('pointermove', { clientX: 200 }));

    expect(props.onValueChange).not.toHaveBeenCalled();
  });

  it('drags a reversed horizontal handle: moving up grows the value', () => {
    const { props, handle } = renderHandle({ orientation: 'horizontal', reverse: true, label: 'Resize', value: 300 });

    fireEvent(handle, pointer('pointerdown', { clientY: 400 }));
    expect(document.body).toHaveClass('is-resizing-row');

    fireEvent(handle, pointer('pointermove', { clientY: 370 }));
    expect(props.onValueChange).toHaveBeenLastCalledWith(330);

    fireEvent(handle, pointer('pointerup', { clientY: 370 }));
    expect(document.body).not.toHaveClass('is-resizing-row');
    expect(props.onValueCommit).toHaveBeenCalledTimes(1);
  });

  it('commits when a drag is cancelled', () => {
    const { props, handle } = renderHandle();

    fireEvent(handle, pointer('pointerdown', { clientX: 100 }));
    fireEvent(handle, pointer('pointercancel', { clientX: 100 }));

    expect(props.onValueCommit).toHaveBeenCalledTimes(1);
    expect(document.body).not.toHaveClass('is-resizing-col');
  });

  it('resets on double-click', () => {
    const { props, handle } = renderHandle();

    fireEvent.doubleClick(handle);

    expect(props.onReset).toHaveBeenCalledTimes(1);
  });

  it('drops the body cursor class when it unmounts mid-drag', () => {
    const { handle } = renderHandle();
    fireEvent(handle, pointer('pointerdown', { clientX: 100 }));
    expect(document.body).toHaveClass('is-resizing-col');

    cleanup();

    expect(document.body).not.toHaveClass('is-resizing-col');
  });

  it('measures a drag from the value at pointer down, not from later renders', () => {
    // The value moves with every pointer move. A drag of 100 px from 500 must end at 600, not compound.
    function Controlled() {
      const [value, setValue] = useState(500);
      return (
        <>
          <span data-testid="value">{value}</span>
          <SplitHandle orientation="vertical" label="Resize" value={value} min={0} max={1000} onValueChange={setValue} onValueCommit={vi.fn()} onReset={vi.fn()} />
        </>
      );
    }
    render(<Controlled />);
    const handle = screen.getByRole('separator');

    fireEvent(handle, pointer('pointerdown', { clientX: 100 }));
    fireEvent(handle, pointer('pointermove', { clientX: 150 }));
    fireEvent(handle, pointer('pointermove', { clientX: 200 }));

    expect(screen.getByTestId('value')).toHaveTextContent('600');
  });
});
