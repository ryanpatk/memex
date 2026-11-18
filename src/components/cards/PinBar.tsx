import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Pin, Plus } from 'lucide-react';
import { PINS_IN_BAR, parseItemKey, pinLabel, pinShortcutIndex, type LinkWithTag } from '@memex/core';
import { usePinScope, usePins } from '../../hooks/usePins';
import { useFeedbackToast } from '../../hooks/useFeedbackToast';
import { useAppStore } from '../../store';
import { ITEM_DRAG_TYPE, parseDragKeys } from '../../utils/itemDrag';
import { cue } from '../../utils/sound';
import { FeedbackToast } from '../ui';
import PinIcon from './PinIcon';
import PinLauncher from './PinLauncher';
import { usePinDragging, usePinListDrag } from './pinDrag';

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .cm-editor'));

/**
 * Pinned sites in the top bar (design A + C, docs/pinned-sites.md): after a
 * divider in the Journal · Cards · Tasks pill, up to five site buttons, then
 * “+N” for the rest, which opens the Pinned launcher. Under 1100px wide the
 * pins fold into one gold pin button that opens the launcher. Inside a space
 * (its page, or Cards with one space chosen) they are that space's pins;
 * everywhere else the global ones. ⌥1–⌥9 open the first nine (not while
 * typing in a field). Drag a pin to reorder it, or off the bar to unpin it;
 * Shift+←/→ moves the focused pin and Delete unpins it. While a link card is
 * dragged a dashed slot appears: drop it there to pin it. With no pins and no
 * drag nothing shows, not even the divider.
 */
const PinBar = () => {
  const { spaceId, spaceName } = usePinScope();
  const { pins, pin, unpin, move } = usePins(spaceId);
  const { toast, flash, handleAnimationEnd } = useFeedbackToast();
  const itemDrag = useAppStore((state) => state.itemDrag);
  const draggingPin = usePinDragging();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [launcherAnchor, setLauncherAnchor] = useState<HTMLButtonElement | null>(null);
  const [dropOver, setDropOver] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const barRef = useRef<HTMLDivElement | null>(null);

  const where = spaceName ? `in ${spaceName}` : 'to the bar';
  const title = spaceName ? `Pinned in ${spaceName}` : 'Pinned';
  const shown = pins.slice(0, PINS_IN_BAR);
  const hidden = pins.length - shown.length;
  const linkKeysDragged = (itemDrag?.keys ?? []).filter((key) => parseItemKey(key).type === 'link');
  const canDropCards = linkKeysDragged.length > 0;

  // ⌥1–⌥9 open a pin, wherever focus is (but not while typing)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isEditable(event.target)) return;
      const index = pinShortcutIndex(event);
      if (index === null || !pins[index]) return;
      event.preventDefault();
      window.open(pins[index].url, '_blank', 'noopener,noreferrer');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pins]);

  const focusPin = useCallback((id: string) => {
    requestAnimationFrame(() => {
      const el =
        document.querySelector<HTMLElement>(`[data-mc-popover] [data-pin-id="${CSS.escape(id)}"] .mc-launch-site`) ??
        barRef.current?.querySelector<HTMLElement>(`[data-pin-id="${CSS.escape(id)}"]`);
      el?.focus();
    });
  }, []);

  const onMove = useCallback(
    (from: number, to: number, focusId?: string) => {
      const name = pins[from] ? pinLabel(pins[from]) : 'Pin';
      cue('move');
      move(from, to).catch(() => {
        cue('error');
        flash('Couldn’t move the pin. Try again.');
      });
      setAnnouncement(
        `${name} moved to place ${to + 1} of ${pins.length}${to >= PINS_IN_BAR ? `, under +${pins.length - PINS_IN_BAR}` : ''}.`,
      );
      if (focusId) focusPin(focusId);
    },
    [flash, focusPin, move, pins],
  );

  const onUnpin = useCallback(
    async (link: LinkWithTag) => {
      const name = pinLabel(link);
      cue('toggle');
      try {
        const undo = await unpin(link.id);
        flash(`Unpinned ${name}.`, {
          label: 'Undo',
          onClick: () => {
            undo().catch(() => flash('Couldn’t pin it again. Try again.'));
          },
        });
      } catch {
        cue('error');
        flash('Couldn’t unpin it. Try again.');
      }
    },
    [flash, unpin],
  );

  const pinCards = useCallback(
    async (keys: string[]) => {
      const ids = keys
        .map(parseItemKey)
        .filter((k) => k.type === 'link')
        .map((k) => k.id);
      if (!ids.length) return;
      try {
        const added = await pin(ids);
        if (!added.length) {
          flash(ids.length === 1 ? 'Already pinned.' : 'Those are already pinned.');
          return;
        }
        cue('confirm');
        flash(added.length === 1 ? `Pinned ${where}.` : `Pinned ${added.length} sites ${where}.`, {
          label: 'Undo',
          onClick: () => {
            Promise.all(added.map((id) => unpin(id))).catch(() => flash('Couldn’t undo. Try again.'));
          },
        });
      } catch {
        cue('error');
        flash('Couldn’t pin it. Try again.');
      }
    },
    [flash, pin, unpin, where],
  );

  const { slot, pinProps, listProps } = usePinListDrag({
    onMove: (from, to) => onMove(from, to, pins[from]?.id),
    onUnpin: (id) => {
      const link = pins.find((p) => p.id === id);
      if (link) void onUnpin(link);
    },
  });

  // Cards dropped on the bar (the dashed slot, or anywhere on the pins)
  const cardDrop = {
    onDragOver: (event: ReactDragEvent<HTMLElement>) => {
      if (!event.dataTransfer.types.includes(ITEM_DRAG_TYPE) || !canDropCards) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setDropOver(true);
    },
    onDragLeave: (event: ReactDragEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropOver(false);
    },
    onDrop: (event: ReactDragEvent<HTMLElement>) => {
      if (!event.dataTransfer.types.includes(ITEM_DRAG_TYPE)) return;
      event.preventDefault();
      setDropOver(false);
      void pinCards(parseDragKeys(event.dataTransfer.getData(ITEM_DRAG_TYPE)));
    },
  };
  useEffect(() => {
    if (!itemDrag) setDropOver(false);
  }, [itemDrag]);

  const onPinKey = (index: number) => (event: ReactKeyboardEvent<HTMLAnchorElement>) => {
    if (event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      const to = index + (event.key === 'ArrowLeft' ? -1 : 1);
      if (to >= 0 && to < pins.length) onMove(index, to, pins[index].id);
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      void onUnpin(pins[index]);
    }
  };

  const closeLauncher = useCallback(
    (returnFocus: boolean) => {
      setLauncherOpen(false);
      if (returnFocus) launcherAnchor?.focus();
    },
    [launcherAnchor],
  );

  const toggleLauncher = (event: { currentTarget: HTMLButtonElement }) => {
    const target = event.currentTarget;
    if (launcherOpen && launcherAnchor === target) {
      setLauncherOpen(false);
      return;
    }
    setLauncherAnchor(target);
    setLauncherOpen(true);
  };

  // In <body>: the top bar is its own layer, which would trap a fixed toast under the page
  const toastNode =
    toast !== null
      ? createPortal(
          <FeedbackToast message={toast.message} phase={toast.phase} action={toast.action} onAnimationEnd={handleAnimationEnd} />,
          document.body,
        )
      : null;

  if (pins.length === 0 && !canDropCards) return toastNode;

  return (
    <>
      <div
        ref={barRef}
        className={`mc-pinbar${draggingPin ? ' is-pin-dragging' : ''}`}
        role="group"
        aria-label={spaceName ? `Pinned sites in ${spaceName}` : 'Pinned sites'}
        {...cardDrop}
      >
        <span className="mc-pinbar-sep" aria-hidden="true" />
        {shown.length > 0 && (
          <span className="mc-pinbar-pins" {...listProps}>
            {shown.map((link, index) => {
              const label = pinLabel(link);
              const mark = slot?.index === index ? ` is-drop-${slot.side}` : '';
              return (
                <a
                  key={link.id}
                  className={`mc-pinbtn${mark}`}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${label} (opens in a new tab)`}
                  aria-keyshortcuts={`Alt+${index + 1}`}
                  data-pin-id={link.id}
                  onKeyDown={onPinKey(index)}
                  {...pinProps(link.id, index, link.url)}
                >
                  <PinIcon link={link} />
                  <span className="mc-pin-tip" aria-hidden="true">
                    {label} <span className="mc-pin-tip-key">⌥{index + 1}</span>
                  </span>
                </a>
              );
            })}
          </span>
        )}
        {hidden > 0 && (
          <button
            type="button"
            className="mc-pinbtn mc-pin-more"
            aria-label={`${hidden} more pinned site${hidden === 1 ? '' : 's'}`}
            aria-haspopup="dialog"
            aria-expanded={launcherOpen && launcherAnchor?.classList.contains('mc-pin-more')}
            onClick={toggleLauncher}
          >
            +{hidden}
          </button>
        )}
        {pins.length > 0 && (
          <button
            type="button"
            className="mc-pinbtn mc-pin-fold"
            aria-label={`${title}: ${pins.length} site${pins.length === 1 ? '' : 's'}`}
            aria-haspopup="dialog"
            aria-expanded={launcherOpen && launcherAnchor?.classList.contains('mc-pin-fold')}
            onClick={toggleLauncher}
          >
            <Pin aria-hidden="true" />
          </button>
        )}
        {canDropCards && (
          <span className={`mc-pinbtn mc-pin-drop${dropOver ? ' is-over' : ''}`} aria-hidden="true">
            <Plus />
            <span className="mc-pin-tip is-shown">Drop to pin</span>
          </span>
        )}
        {draggingPin && (
          <span className="mc-pinbar-hint" aria-hidden="true">
            Drop outside the bar to unpin
          </span>
        )}
        <span className="mc-sr-only" role="status" aria-live="polite">
          {announcement}
        </span>
      </div>
      <PinLauncher
        anchor={launcherAnchor}
        open={launcherOpen}
        onClose={closeLauncher}
        pins={pins}
        title={title}
        onMove={onMove}
        onUnpin={(link) => void onUnpin(link)}
      />
      {toastNode}
    </>
  );
};

export default PinBar;
