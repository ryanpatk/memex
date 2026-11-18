import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pin } from 'lucide-react';
import { pinLabel, pinShortcutIndex, type LinkWithTag } from '@memex/core';
import { usePinScope, usePins } from '../../hooks/usePins';
import { useFeedbackToast } from '../../hooks/useFeedbackToast';
import { cue } from '../../utils/sound';
import { FeedbackToast } from '../ui';
import PinLauncher from './PinLauncher';

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], .cm-editor'));

/**
 * Pinned sites in the top bar (design C, docs/pinned-sites.md): one gold
 * pin button beside the Inbox. It opens the Pinned launcher with every pin
 * in this scope: inside a space (its page, or Cards with one space chosen)
 * that space's pins, everywhere else the global ones. Nothing else about
 * pins shows in the bar. ⌥1–⌥9 open the first nine (not while typing in a
 * field); the sticky bar's copy passes `shortcuts={false}` so they're bound
 * once. To pin by dragging, drop a link card on Pin in the drop tray
 * (DropTray), which opens over the top bar while a card moves.
 */
const PinnedButton = ({ shortcuts = true }: { shortcuts?: boolean }) => {
  const { spaceId, spaceName } = usePinScope();
  const { pins, unpin, move } = usePins(spaceId);
  const { toast, flash, handleAnimationEnd } = useFeedbackToast();
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

  const title = spaceName ? `Pinned in ${spaceName}` : 'Pinned';

  // ⌥1–⌥9 open a pin, wherever focus is (but not while typing)
  useEffect(() => {
    if (!shortcuts) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isEditable(event.target)) return;
      const index = pinShortcutIndex(event);
      if (index === null || !pins[index]) return;
      event.preventDefault();
      window.open(pins[index].url, '_blank', 'noopener,noreferrer');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pins, shortcuts]);

  const onMove = useCallback(
    (from: number, to: number, focusId?: string) => {
      const name = pins[from] ? pinLabel(pins[from]) : 'Pin';
      cue('move');
      move(from, to).catch(() => {
        cue('error');
        flash('Couldn’t move the pin. Try again.');
      });
      setAnnouncement(`${name} moved to place ${to + 1} of ${pins.length}.`);
      if (focusId) {
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>(`[data-mc-popover] [data-pin-id="${CSS.escape(focusId)}"] .mc-launch-site`)?.focus(),
        );
      }
    },
    [flash, move, pins],
  );

  const onUnpin = useCallback(
    async (link: LinkWithTag) => {
      cue('toggle');
      try {
        const undo = await unpin(link.id);
        flash(`Unpinned ${pinLabel(link)}.`, {
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

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  const count = `${pins.length} site${pins.length === 1 ? '' : 's'}`;
  return (
    <>
      <button
        ref={(node) => {
          buttonRef.current = node;
          setAnchor(node);
        }}
        type="button"
        className="mc-rb mc-pins-btn"
        aria-label={`${title}, ${count}`}
        title={`${title} · ⌥1–9`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Pin aria-hidden="true" />
      </button>
      <span className="mc-sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
      <PinLauncher
        anchor={anchor}
        open={open}
        onClose={close}
        pins={pins}
        title={title}
        emptyText={
          spaceName
            ? `Nothing pinned in ${spaceName} yet. Pin a save from its card’s •••, or drag a card onto Pin.`
            : 'Nothing pinned yet. Pin a site from its card’s •••, or drag a card onto Pin.'
        }
        onMove={onMove}
        onUnpin={(link) => void onUnpin(link)}
      />
      {/* In <body>, so no stacking context in the top bar can trap the fixed toast */}
      {toast !== null &&
        createPortal(
          <FeedbackToast message={toast.message} phase={toast.phase} action={toast.action} onAnimationEnd={handleAnimationEnd} />,
          document.body,
        )}
    </>
  );
};

export default PinnedButton;
