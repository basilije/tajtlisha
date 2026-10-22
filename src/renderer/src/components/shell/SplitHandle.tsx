import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { SPLITTER_LARGE_STEP_PX, SPLITTER_STEP_PX } from '../../hooks/editorLayout';

export type SplitOrientation = 'vertical' | 'horizontal';

export type SplitHandleProps = {
  /** 'vertical' is a line that runs top to bottom and moves left and right. */
  orientation: SplitOrientation;
  /** Accessible name, already translated. */
  label: string;
  value: number;
  min: number;
  max: number;
  /** Set when the value grows as the handle moves up or left, such as a panel below a horizontal handle. */
  reverse?: boolean;
  /** Called during a drag and on each key step with the requested value. The owner clamps it. */
  onValueChange: (value: number) => void;
  /** Called once when a drag ends or a key step is made, so the owner can persist. */
  onValueCommit: () => void;
  onReset: () => void;
};

const BODY_CLASS: Record<SplitOrientation, string> = {
  vertical: 'is-resizing-col',
  horizontal: 'is-resizing-row'
};

type DragState = { pointerId: number; origin: number; startValue: number };

/**
 * Drag and keyboard splitter. Dragging uses pointer capture, so the drag keeps
 * working when the pointer leaves the thin handle. Arrow keys stop at the handle
 * and do not reach window shortcuts. Double-click resets the size.
 */
export function SplitHandle({
  orientation,
  label,
  value,
  min,
  max,
  reverse = false,
  onValueChange,
  onValueCommit,
  onReset
}: SplitHandleProps) {
  const [dragging, setDragging] = useState(false);
  const drag = useRef<DragState | null>(null);
  const vertical = orientation === 'vertical';
  const sign = reverse ? -1 : 1;

  // The body class sets the cursor and blocks text selection. Remove it if the handle unmounts mid-drag.
  useEffect(() => () => document.body.classList.remove(BODY_CLASS[orientation]), [orientation]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
    drag.current = {
      pointerId: event.pointerId,
      origin: vertical ? event.clientX : event.clientY,
      startValue: value
    };
    setDragging(true);
    document.body.classList.add(BODY_CLASS[orientation]);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const pointer = vertical ? event.clientX : event.clientY;
    onValueChange(current.startValue + sign * (pointer - current.origin));
  }

  function endDrag(event: PointerEvent<HTMLDivElement>): void {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    document.body.classList.remove(BODY_CLASS[orientation]);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onValueCommit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const forward = vertical ? 'ArrowRight' : 'ArrowDown';
    const backward = vertical ? 'ArrowLeft' : 'ArrowUp';

    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      onValueChange(event.key === 'Home' ? min : max);
      onValueCommit();
      return;
    }
    if (event.key !== forward && event.key !== backward) return;

    // Stop here so the editor's window-level arrow shortcuts (frame stepping) do not also fire.
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? SPLITTER_LARGE_STEP_PX : SPLITTER_STEP_PX;
    const pointerDelta = event.key === forward ? step : -step;
    onValueChange(value + sign * pointerDelta);
    onValueCommit();
  }

  const className = [
    'split-handle',
    vertical ? 'split-handle-vertical' : 'split-handle-horizontal',
    dragging ? 'is-dragging' : ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={orientation}
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={Math.round(min)}
      aria-valuemax={Math.round(max)}
      className={className}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      onDoubleClick={onReset}
    />
  );
}
