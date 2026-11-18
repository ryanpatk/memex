import { Fragment, useCallback, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { useAppStore } from '../../store';
import { useSpaceColors } from '../../hooks/useSpaceColors';
import { useSpaceOrder } from '../../hooks/useSpaceOrder';
import { notices } from '../../utils/notices';
import { cue } from '../../utils/sound';
import Sheet from './Sheet';
import { Switch } from './Controls';

const SPACE_DRAG_TYPE = 'application/x-memex-space';

/**
 * Edit spaces (design B, docs/spaces-row.md), opened from More → Edit
 * spaces… and from Settings. Every space in your order: drag a row (by its
 * grip) to move it, or use ↑ ↓ on a row, or Alt+↑/↓ anywhere in it. The
 * “In More” line shows where the pill row on Cards runs out at this window
 * width (the row fits as many as it can). “Show in the row” off hides a
 * space from the pill rows without moving it; it stays in More, Move to…,
 * ⌘K and the drop tray. Every change saves at once; colours never change.
 */
const EditSpacesSheet = () => {
  const open = useAppStore((state) => state.editSpacesOpen);
  const setOpen = useAppStore((state) => state.setEditSpacesOpen);
  const fit = useAppStore((state) => state.spaceRowFit);
  const colors = useSpaceColors();
  const { spaces, move, setHidden } = useSpaceOrder();
  const [announcement, setAnnouncement] = useState('');
  const [dropAt, setDropAt] = useState<{ index: number; side: 'before' | 'after' } | null>(null);
  const dragFrom = useRef<number | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);

  const failed = useCallback(() => {
    cue('error');
    notices.publish('Couldn’t save the space order. Try again.');
  }, []);

  const moveTo = useCallback(
    (from: number, to: number, focus: 'grip' | 'up' | 'down' | null = 'grip') => {
      if (to < 0 || to >= spaces.length || from === to) return;
      const name = spaces[from]?.name ?? 'Space';
      const id = spaces[from]?.id;
      cue('move');
      move(from, to).catch(failed);
      setAnnouncement(`${name} moved to place ${to + 1} of ${spaces.length}.`);
      if (id && focus) {
        requestAnimationFrame(() => {
          const row = listRef.current?.querySelector<HTMLElement>(`[data-space-id="${CSS.escape(id)}"]`);
          (row?.querySelector<HTMLElement>(`[data-focus="${focus}"]:not(:disabled)`) ?? row?.querySelector<HTMLElement>('[data-focus="grip"]'))?.focus();
        });
      }
    },
    [failed, move, spaces],
  );

  const onRowKey = (index: number) => (event: KeyboardEvent<HTMLLIElement>) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    moveTo(index, index + (event.key === 'ArrowUp' ? -1 : 1));
  };

  // The “In More” line goes after the fit-th space that shows in the row
  let shownSoFar = 0;
  const lineAfter = (() => {
    if (fit === null) return -1;
    for (let i = 0; i < spaces.length; i += 1) {
      if (!spaces[i].hidden) shownSoFar += 1;
      if (shownSoFar === fit) return spaces.slice(i + 1).some((s) => !s.hidden) ? i : -1;
    }
    return -1;
  })();

  const rowDrag = (index: number) => ({
    onDragStart: (event: DragEvent<HTMLLIElement>) => {
      dragFrom.current = index;
      event.dataTransfer.setData(SPACE_DRAG_TYPE, spaces[index].id);
      event.dataTransfer.effectAllowed = 'move';
    },
    onDragOver: (event: DragEvent<HTMLLIElement>) => {
      if (!event.dataTransfer.types.includes(SPACE_DRAG_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const r = event.currentTarget.getBoundingClientRect();
      const side = event.clientY < r.top + r.height / 2 ? 'before' : 'after';
      if (dropAt?.index !== index || dropAt.side !== side) setDropAt({ index, side });
    },
    onDrop: (event: DragEvent<HTMLLIElement>) => {
      if (!event.dataTransfer.types.includes(SPACE_DRAG_TYPE) || dragFrom.current === null) return;
      event.preventDefault();
      const from = dragFrom.current;
      const r = event.currentTarget.getBoundingClientRect();
      const insertAt = event.clientY < r.top + r.height / 2 ? index : index + 1;
      moveTo(from, insertAt > from ? insertAt - 1 : insertAt, null);
      setDropAt(null);
    },
    onDragEnd: () => {
      dragFrom.current = null;
      setDropAt(null);
    },
  });

  return (
    <Sheet open={open} onClose={() => setOpen(false)} title="Spaces" titleSize="h2" width={760}>
      <p className="mc-es-lede">
        Drag to reorder, or use ↑ ↓ (Alt+↑/↓ on a row). The spaces at the top fill the pill row on Cards, as many as fit the window; the rest
        wait in More. Hidden spaces stay in More, Move to… and search.
      </p>
      <ol className="mc-es-list" ref={listRef} aria-label="Spaces in order">
        {spaces.map((space, index) => {
          const mark = dropAt?.index === index ? ` is-drop-${dropAt.side}` : '';
          return (
            <Fragment key={space.id}>
              <li
                className={`mc-es-row${space.hidden ? ' is-hidden' : ''}${mark}`}
                data-space-id={space.id}
                draggable
                onKeyDown={onRowKey(index)}
                {...rowDrag(index)}
              >
                <button type="button" className="mc-es-grip" data-focus="grip" aria-label={`${space.name}, place ${index + 1}. Alt+↑ or Alt+↓ to move`}>
                  <GripVertical aria-hidden="true" />
                </button>
                <span className="mc-es-dot" style={{ '--c': colors.get(space.id) } as CSSProperties} aria-hidden="true" />
                <span className="mc-es-name" translate="no">
                  {space.name}
                </span>
                {space.hidden && <span className="mc-es-tag">Hidden</span>}
                <span className="mc-es-moves">
                  <button
                    type="button"
                    className="mc-rb is-small"
                    data-focus="up"
                    aria-label={`Move ${space.name} up`}
                    disabled={index === 0}
                    onClick={() => moveTo(index, index - 1, 'up')}
                  >
                    <ArrowUp aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="mc-rb is-small"
                    data-focus="down"
                    aria-label={`Move ${space.name} down`}
                    disabled={index === spaces.length - 1}
                    onClick={() => moveTo(index, index + 1, 'down')}
                  >
                    <ArrowDown aria-hidden="true" />
                  </button>
                </span>
                <span className="mc-es-show">
                  <span className="mc-es-show-label" aria-hidden="true">
                    In the row
                  </span>
                  <Switch
                    checked={!space.hidden}
                    label={`Show ${space.name} in the pill row`}
                    onChange={(show) => {
                      cue('toggle');
                      setHidden(space.id, !show).catch(failed);
                      setAnnouncement(show ? `${space.name} shows in the row.` : `${space.name} is hidden from the row.`);
                    }}
                  />
                </span>
              </li>
              {index === lineAfter && (
                <li className="mc-es-line" aria-hidden="true">
                  <span>In More at this window width</span>
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
      <span className="mc-sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </Sheet>
  );
};

export default EditSpacesSheet;
