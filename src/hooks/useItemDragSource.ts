import { useEffect } from 'react';
import { useAppStore } from '../store';
import { ITEM_DRAG_TYPE, dragGhostLabel, resolveDragKeys } from '../utils/itemDrag';

/**
 * Installs the one listener that turns a drag starting on an item (any
 * element with `data-item-key`, or `data-drag-keys` for a gallery) into a
 * drag of item keys: the item, or the whole selection when the item is in
 * it. Native link and image drags inside a card keep their own data (a URL
 * still drops into another app) and gain the keys. Mounted once by the shell.
 */
export function useItemDragSource() {
  useEffect(() => {
    let ghost: HTMLElement | null = null;
    let sources: HTMLElement[] = [];

    const cleanup = () => {
      sources.forEach((el) => el.classList.remove('is-drag-source'));
      sources = [];
      ghost?.remove();
      ghost = null;
      document.documentElement.classList.remove('is-item-dragging');
      if (useAppStore.getState().itemDrag) useAppStore.getState().setItemDrag(null);
    };

    const onDragStart = (event: DragEvent) => {
      const node = event.target;
      const start = node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
      if (!start || !event.dataTransfer) return;
      // Dragging text out of a field stays a text drag
      if (start.closest('input, textarea, [contenteditable="true"]')) return;
      const el = start.closest<HTMLElement>('[data-drag-keys], [data-item-key]');
      if (!el) return;

      const own = el.dataset.dragKeys ? el.dataset.dragKeys.split(',') : [el.dataset.itemKey ?? ''];
      const state = useAppStore.getState();
      const keys = resolveDragKeys(own, { active: state.selectionMode, keys: state.selectedItemKeys });
      if (keys.length === 0) return;

      event.dataTransfer.setData(ITEM_DRAG_TYPE, JSON.stringify(keys));
      // Our own draggable elements: filing copies into a space. Native link and
      // image drags keep the browser's own effects so they still work elsewhere.
      if (start === el || !start.closest('a, img')) {
        event.dataTransfer.effectAllowed = 'copy';
        // Something readable for drops outside memex
        if (!event.dataTransfer.types.includes('text/plain')) {
          event.dataTransfer.setData('text/plain', el.dataset.dragLabel ?? '');
        }
      }

      // The ghost: a small paper label with the title or the count
      cleanup();
      ghost = document.createElement('div');
      ghost.className = `memex-drag-ghost${keys.length > 1 ? ' is-stack' : ''}`;
      ghost.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'memex-drag-ghost-label';
      label.textContent = dragGhostLabel(keys, el.dataset.dragLabel);
      ghost.append(label);
      if (keys.length > 1) {
        const count = document.createElement('span');
        count.className = 'memex-drag-ghost-count';
        count.textContent = String(keys.length);
        ghost.prepend(count);
      }
      document.body.append(ghost);
      event.dataTransfer.setDragImage(ghost, 14, 14);

      // Change the page only after the drag has begun (doing it inside
      // dragstart can cancel the drag in some browsers)
      requestAnimationFrame(() => {
        ghost?.remove();
        document.documentElement.classList.add('is-item-dragging');
        sources = keys.flatMap((key) =>
          Array.from(document.querySelectorAll<HTMLElement>(`[data-item-key="${CSS.escape(key)}"]`)),
        );
        if (el.dataset.dragKeys) sources.push(el);
        sources.forEach((source) => source.classList.add('is-drag-source'));
        useAppStore.getState().setItemDrag({ keys });
      });
    };

    // dragend doesn't reach the document when the dragged element left the
    // page mid-drag (filtered out by the drop), so also end on drop and on
    // the first pointer move after a drag.
    const onEnd = () => {
      if (useAppStore.getState().itemDrag || sources.length) cleanup();
    };

    document.addEventListener('dragstart', onDragStart);
    document.addEventListener('dragend', onEnd);
    document.addEventListener('drop', onEnd);
    document.addEventListener('pointermove', onEnd);
    return () => {
      document.removeEventListener('dragstart', onDragStart);
      document.removeEventListener('dragend', onEnd);
      document.removeEventListener('drop', onEnd);
      document.removeEventListener('pointermove', onEnd);
      cleanup();
    };
  }, []);
}
