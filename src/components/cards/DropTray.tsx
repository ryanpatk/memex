import { useCallback, useEffect, useState, type DragEvent } from 'react';
import { Pin, Plus } from 'lucide-react';
import { parseItemKey } from '@memex/core';
import { useAppStore } from '../../store';
import { useProfiles } from '../../hooks/useProfiles';
import { useSpaceColors } from '../../hooks/useSpaceColors';
import { useAddToSpace } from '../../hooks/useAddToSpace';
import { useFeedbackToast } from '../../hooks/useFeedbackToast';
import { usePinScope, usePins } from '../../hooks/usePins';
import { ITEM_DRAG_TYPE, parseDragKeys } from '../../utils/itemDrag';
import { cue } from '../../utils/sound';
import { FeedbackToast } from '../ui';
import SpacePill from './SpacePill';
import NewSpaceSheet from './NewSpaceSheet';

type Target = string | 'new' | 'pin';

/**
 * The drop tray (design C, docs/spaces-row.md): the moment a card (or a
 * selection, a task row, a Journal entry) starts moving, a tray opens over
 * the top of the page with every space in your order, hidden ones and the
 * ones in More included, as full-size drop targets, plus “+ New space” and,
 * for links, the gold Pin. It works at any scroll position on every page,
 * and folds away when the drag ends (dropped, Esc, or let go elsewhere).
 * Mounted once by MemexShell. Filing goes through useAddToSpace, the same
 * path as the space pills, with its toast and Undo.
 */
const DropTray = () => {
  const itemDrag = useAppStore((state) => state.itemDrag);
  const { data: spaces } = useProfiles();
  const colors = useSpaceColors();
  const { toast, flash, handleAnimationEnd } = useFeedbackToast();
  const addToSpace = useAddToSpace(flash);
  const { spaceId: pinScope, spaceName: pinScopeName } = usePinScope();
  const { pin, unpin } = usePins(pinScope);
  const [over, setOver] = useState<Target | null>(null);
  const [newSpaceKeys, setNewSpaceKeys] = useState<string[] | null>(null);

  const keys = itemDrag?.keys ?? [];
  const open = keys.length > 0;
  const linkIds = keys.map((key) => parseItemKey(key)).filter((k) => k.type === 'link').map((k) => k.id);

  useEffect(() => {
    if (!open) setOver(null);
  }, [open]);

  const pinLinks = useCallback(
    async (ids: string[]) => {
      try {
        const added = await pin(ids);
        if (!added.length) {
          flash(ids.length === 1 ? 'Already pinned.' : 'Those are already pinned.');
          return;
        }
        cue('confirm');
        const where = pinScopeName ? ` in ${pinScopeName}` : '';
        flash(added.length === 1 ? `Pinned${where}.` : `Pinned ${added.length} sites${where}.`, {
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
    [flash, pin, pinScopeName, unpin],
  );

  const target = (id: Target) => {
    const accepts = (event: DragEvent) => event.dataTransfer.types.includes(ITEM_DRAG_TYPE);
    const enter = (event: DragEvent) => {
      if (!accepts(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      if (over !== id) setOver(id);
    };
    return {
      onDragEnter: enter,
      onDragOver: enter,
      onDragLeave: (event: DragEvent) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setOver((current) => (current === id ? null : current));
      },
      onDrop: (event: DragEvent) => {
        if (!accepts(event)) return;
        event.preventDefault();
        setOver(null);
        const dropped = parseDragKeys(event.dataTransfer.getData(ITEM_DRAG_TYPE));
        if (!dropped.length) return;
        if (id === 'new') setNewSpaceKeys(dropped);
        else if (id === 'pin') {
          const ids = dropped.map((key) => parseItemKey(key)).filter((k) => k.type === 'link').map((k) => k.id);
          void pinLinks(ids);
        } else void addToSpace(id, dropped);
      },
    };
  };

  return (
    <>
      {open && (
        <div className="mc-tray" role="region" aria-label="Drop on a space">
          <div className="mc-tray-head">
            <h2 className="mc-tray-title">Drop on a space</h2>
            <span className="mc-tray-hint">Esc, or drop anywhere else, to cancel</span>
          </div>
          <div className="mc-tray-pills">
            {(spaces ?? []).map((space) => (
              <SpacePill
                key={space.id}
                name={space.name}
                color={colors.get(space.id)}
                target={over === space.id ? 'over' : 'idle'}
                ariaLabel={`File in ${space.name}`}
                dropHandlers={target(space.id)}
              />
            ))}
            <button type="button" className={`mc-pill is-slot mc-tray-new${over === 'new' ? ' is-drop' : ''}`} tabIndex={-1} {...target('new')}>
              <Plus aria-hidden="true" /> New space
            </button>
            {linkIds.length > 0 && (
              <button type="button" className={`mc-pill mc-tray-pin${over === 'pin' ? ' is-drop' : ''}`} tabIndex={-1} {...target('pin')}>
                <span className="mc-tray-pin-disc" aria-hidden="true">
                  <Pin />
                </span>
                {pinScopeName ? `Pin in ${pinScopeName}` : 'Pin'}
              </button>
            )}
          </div>
        </div>
      )}
      <NewSpaceSheet
        open={newSpaceKeys !== null}
        onClose={() => setNewSpaceKeys(null)}
        onFeedback={flash}
        onCreated={(spaceId, name) => {
          const pending = newSpaceKeys ?? [];
          setNewSpaceKeys(null);
          if (pending.length) void addToSpace(spaceId, pending, name);
        }}
      />
      {toast !== null && (
        <FeedbackToast message={toast.message} phase={toast.phase} action={toast.action} onAnimationEnd={handleAnimationEnd} />
      )}
    </>
  );
};

export default DropTray;
