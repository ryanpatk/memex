import { useCallback, useEffect, useRef, useState, type DragEvent as ReactDragEvent } from 'react';

/*
 * Dragging pins into order (the top bar and the Pinned launcher). A pin's
 * own drag carries PIN_DRAG_TYPE (plus its URL, so it still drops into
 * another app as a link). Over a pin list, the nearest pin shows where it
 * will land (before or after it); dropping there moves it. Dropping it
 * anywhere else on the page unpins it (the caller offers Undo); Esc or a
 * drop outside the window does nothing. Plain HTML5 drag and drop, the same
 * as dragging cards onto space pills.
 */

export const PIN_DRAG_TYPE = 'application/x-memex-pin';

/** The pin being dragged (dataTransfer can't be read during dragover). */
let dragging: { id: string; from: number } | null = null;
const listeners = new Set<(active: boolean) => void>();
const setDragging = (next: typeof dragging) => {
  dragging = next;
  document.documentElement.classList.toggle('is-pin-dragging', next !== null);
  listeners.forEach((l) => l(next !== null));
};

/** Whether a pin is being dragged right now (for hints). */
export const usePinDragging = () => {
  const [active, setActive] = useState(dragging !== null);
  useEffect(() => {
    listeners.add(setActive);
    return () => {
      listeners.delete(setActive);
    };
  }, []);
  return active;
};

export const isPinDrag = (event: { dataTransfer: DataTransfer | null }) =>
  Boolean(event.dataTransfer?.types.includes(PIN_DRAG_TYPE));

/** Where a drop lands among the list's pins (`[data-pin-index]`): the nearest pin, before or after it. */
export const dropSlot = (container: HTMLElement, x: number, y: number): { index: number; side: 'before' | 'after' } | null => {
  let best: { index: number; side: 'before' | 'after' } | null = null;
  let bestDistance = Infinity;
  for (const el of Array.from(container.querySelectorAll<HTMLElement>('[data-pin-index]'))) {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // Rows count for more than columns, so a grid picks the pin in your row
    const distance = Math.hypot(x - cx, (y - cy) * 2);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { index: Number(el.dataset.pinIndex), side: x < cx ? 'before' : 'after' };
    }
  }
  return best;
};

/** The index `movePin` wants for a pin at `from` dropped before/after the pin at `index`. */
export const dropTarget = (from: number, slot: { index: number; side: 'before' | 'after' }) => {
  const insertAt = slot.side === 'before' ? slot.index : slot.index + 1;
  return insertAt > from ? insertAt - 1 : insertAt;
};

/**
 * Drag-to-order for one list of pins. `onMove(from, to)` reorders;
 * `onUnpin(id)` runs when a pin is dropped on the page outside every list.
 */
export function usePinListDrag({
  onMove,
  onUnpin,
}: {
  onMove: (from: number, to: number) => void;
  onUnpin: (id: string) => void;
}) {
  const [slot, setSlot] = useState<{ index: number; side: 'before' | 'after' } | null>(null);
  const handlers = useRef({ onMove, onUnpin });
  handlers.current = { onMove, onUnpin };

  /** Spread on each pin's element. */
  const pinProps = useCallback(
    (id: string, index: number, url: string) => ({
      draggable: true,
      'data-pin-index': index,
      onDragStart: (event: ReactDragEvent<HTMLElement>) => {
        event.dataTransfer.setData(PIN_DRAG_TYPE, id);
        event.dataTransfer.setData('text/uri-list', url);
        event.dataTransfer.setData('text/plain', url);
        event.dataTransfer.effectAllowed = 'copyMove';
        // Change the page after the drag has begun (inside dragstart it can cancel it)
        requestAnimationFrame(() => setDragging({ id, from: index }));
        const onDocOver = (e: DragEvent) => {
          if (e.dataTransfer?.types.includes(PIN_DRAG_TYPE)) e.preventDefault();
        };
        const onDocDrop = (e: DragEvent) => {
          if (!e.dataTransfer?.types.includes(PIN_DRAG_TYPE) || e.defaultPrevented) return;
          // Dropped on the page, away from every pin list: unpin
          e.preventDefault();
          if (dragging) handlers.current.onUnpin(dragging.id);
        };
        const end = () => {
          document.removeEventListener('dragover', onDocOver);
          document.removeEventListener('drop', onDocDrop);
          document.removeEventListener('dragend', end, true);
          setSlot(null);
          setDragging(null);
        };
        document.addEventListener('dragover', onDocOver);
        document.addEventListener('drop', onDocDrop);
        document.addEventListener('dragend', end, true);
      },
    }),
    [],
  );

  /** Spread on the list's container. */
  const listProps = {
    onDragOver: (event: ReactDragEvent<HTMLElement>) => {
      if (!isPinDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const next = dropSlot(event.currentTarget, event.clientX, event.clientY);
      setSlot((prev) => (prev?.index === next?.index && prev?.side === next?.side ? prev : next));
    },
    onDragLeave: (event: ReactDragEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSlot(null);
    },
    onDrop: (event: ReactDragEvent<HTMLElement>) => {
      if (!isPinDrag(event)) return;
      // Handled here: the page-level drop (unpin) skips it
      event.preventDefault();
      const target = dropSlot(event.currentTarget, event.clientX, event.clientY);
      setSlot(null);
      if (dragging && target) {
        const to = dropTarget(dragging.from, target);
        if (to !== dragging.from) handlers.current.onMove(dragging.from, to);
      }
    },
  };

  return { slot, pinProps, listProps };
}
