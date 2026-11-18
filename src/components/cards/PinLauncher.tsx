import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { PIN_SHORTCUTS, pinLabel, type LinkWithTag } from '@memex/core';
import Popover from './Popover';
import PinIcon from './PinIcon';
import { usePinDragging, usePinListDrag } from './pinDrag';

interface PinLauncherProps {
  anchor: HTMLElement | null;
  open: boolean;
  /** Closes it; `returnFocus` puts focus back on the button that opened it. */
  onClose: (returnFocus: boolean) => void;
  pins: LinkWithTag[];
  /** “Pinned” or “Pinned in Kitchen reno”. */
  title: string;
  onMove: (from: number, to: number, focusId?: string) => void;
  onUnpin: (link: LinkWithTag) => void;
}

const COLUMNS = 3;

/**
 * The Pinned launcher (design C): every pin in this scope as a grid of round
 * site buttons with their names. It opens from “+N” in the top bar (more
 * than five pins) and from the folded pin button in narrow windows. Drag a
 * pin to reorder; arrows move between pins and Shift+←/→ moves the focused
 * pin; “Edit pins” shows an ✕ on each to unpin (Undo in the toast). A
 * non-modal dialog: Esc closes and returns focus, clicking outside closes,
 * opening a site closes it.
 */
const PinLauncher = ({ anchor, open, onClose, pins, title, onMove, onUnpin }: PinLauncherProps) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [editing, setEditing] = useState(false);
  const draggingPin = usePinDragging();
  const { slot, pinProps, listProps } = usePinListDrag({
    onMove: (from, to) => onMove(from, to, pins[from]?.id),
    onUnpin: (id) => {
      const link = pins.find((p) => p.id === id);
      if (link) onUnpin(link);
    },
  });

  useEffect(() => {
    if (!open) {
      setEditing(false);
      return;
    }
    // Focus the first site once it's placed
    const frame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('.mc-launch-site')?.focus());
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchor?.contains(target)) return;
      onClose(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [anchor, onClose, open]);

  // Nothing left to show (the last pin was unpinned)
  useEffect(() => {
    if (open && pins.length === 0) onClose(true);
  }, [onClose, open, pins.length]);

  const sites = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('.mc-launch-site') ?? []);

  const onPanelKey = (event: ReactKeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
      return;
    }
    const list = sites();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLUMNS, ArrowDown: COLUMNS };
    if (event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      const to = index + step[event.key];
      if (to >= 0 && to < pins.length) onMove(index, to, pins[index].id);
    } else if (!event.shiftKey && event.key in step) {
      event.preventDefault();
      list[Math.max(0, Math.min(list.length - 1, index + step[event.key]))]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      (event.key === 'Home' ? list[0] : list[list.length - 1])?.focus();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      (list[index + 1] ?? list[index - 1])?.focus();
      onUnpin(pins[index]);
    }
  };

  return (
    <Popover
      anchor={anchor}
      open={open}
      placement="bottom"
      popoverRef={panelRef}
      role="dialog"
      aria-label={title}
      className="mc-launcher"
      onKeyDown={onPanelKey}
      onBlur={(event) => {
        // Tabbing out of it closes it, as with the menus
        const next = event.relatedTarget as Node | null;
        if (next && !panelRef.current?.contains(next) && !anchor?.contains(next)) onClose(false);
      }}
    >
      <div className="mc-launch-head">
        <h2 className="mc-launch-title">{title}</h2>
        <span className="mc-keyhint" aria-label={`Option 1 to ${Math.min(PIN_SHORTCUTS, pins.length)} open these`}>
          <kbd className="mc-kb">⌥</kbd>
          <kbd className="mc-kb">1–{Math.min(PIN_SHORTCUTS, Math.max(1, pins.length))}</kbd>
        </span>
      </div>
      <ul className={`mc-launch-grid${editing ? ' is-editing' : ''}`} {...listProps}>
        {pins.map((link, index) => {
          const label = pinLabel(link);
          const mark = slot?.index === index ? ` is-drop-${slot.side}` : '';
          return (
            <li key={link.id} className={`mc-launch-tile${mark}`} data-pin-id={link.id} {...pinProps(link.id, index, link.url)}>
              <a
                className="mc-launch-site"
                href={link.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`${label} (opens in a new tab)`}
                aria-keyshortcuts={index < PIN_SHORTCUTS ? `Alt+${index + 1}` : undefined}
                onClick={() => onClose(false)}
                draggable={false}
              >
                <span className="mc-rb is-large" aria-hidden="true">
                  <PinIcon link={link} size={30} />
                </span>
                <span className="mc-launch-name">{label}</span>
              </a>
              {editing && (
                <button type="button" className="mc-launch-x" aria-label={`Unpin ${label}`} onClick={() => onUnpin(link)}>
                  <X aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mc-launch-foot">
        {draggingPin ? (
          <p className="mc-launch-hint">Drop on a pin to move it, or outside to unpin it.</p>
        ) : (
          <>
            <p className="mc-launch-hint">Drag to reorder.</p>
            <button type="button" className="mc-btn is-quiet is-small" aria-pressed={editing} onClick={() => setEditing((v) => !v)}>
              {editing ? 'Done' : 'Edit pins…'}
            </button>
          </>
        )}
      </div>
    </Popover>
  );
};

export default PinLauncher;
