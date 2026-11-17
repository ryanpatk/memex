import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreHorizontal, Plus } from 'lucide-react';
import type { Profile } from '@memex/core';
import { useAppStore } from '../../store';
import { useProfileLinkMembership } from '../../hooks/useProfileLinks';
import { useProfileNoteMembership } from '../../hooks/useProfileNotes';
import { useProfileTaskMembership } from '../../hooks/useProfileTasks';
import { useAllSelfMessages } from '../../hooks/useSelfMessages';
import { ITEM_DRAG_TYPE, isFileableKey, parseDragKeys } from '../../utils/itemDrag';
import Menu from './Menu';
import SpacePill from './SpacePill';
import { visibleSpacePills } from './spacePills';

const JUST_ADDED_MS = 1400;

interface SpacePillRowProps {
  /** Undefined while spaces load: loading pills hold the row's place. */
  spaces: Profile[] | undefined;
  colors: Map<string, string>;
  /** The one space the page shows, or null for All. */
  selectedId: string | null;
  /** All is lit (no space filter at all). */
  allOn: boolean;
  /** Where a pill goes: the page with that space chosen (null = All). */
  hrefFor: (spaceId: string | null) => string;
  /** Files items in a space (drag, or the selection); resolves to how many were added. */
  onAdd: (spaceId: string, keys: string[]) => Promise<number>;
  onNewSpace: () => void;
}

/**
 * The space pill row (d01/d02, decision 3 A): All, then each space as a
 * cartridge pill (the chosen one fills with its colour), More past six, and
 * an empty “+” slot for a new space. Pills keep the sidebar's jobs: drop
 * cards on one to file them (d10), and while cards are selected the row
 * reads “Add N to…” and each pill adds the selection (“All in” when it holds
 * them already).
 */
const SpacePillRow = ({ spaces, colors, selectedId, allOn, hrefFor, onAdd, onNewSpace }: SpacePillRowProps) => {
  const selectionMode = useAppStore((state) => state.selectionMode);
  const selectedItemKeys = useAppStore((state) => state.selectedItemKeys);
  const itemDrag = useAppStore((state) => state.itemDrag);
  const dragKeys = itemDrag?.keys ?? [];
  const dropActive = dragKeys.length > 0;
  const selecting = selectionMode && selectedItemKeys.length > 0;
  const targetMode = dropActive || selecting;
  const targetKeys = dropActive ? dragKeys : selectedItemKeys;
  const [overId, setOverId] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const navigate = useNavigate();

  const { data: linkRows } = useProfileLinkMembership();
  const { data: noteRows } = useProfileNoteMembership();
  const { data: taskRows } = useProfileTaskMembership();
  const { data: jots } = useAllSelfMessages();
  const held = useMemo(() => {
    const bySpace = new Map<string, Set<string>>();
    const add = (spaceId: string, key: string) => {
      let keys = bySpace.get(spaceId);
      if (!keys) bySpace.set(spaceId, (keys = new Set()));
      keys.add(key);
    };
    (linkRows ?? []).forEach((row) => add(row.profile_id, `link:${row.link_id}`));
    (noteRows ?? []).forEach((row) => add(row.profile_id, `note:${row.note_id}`));
    (taskRows ?? []).forEach((row) => add(row.profile_id, `task:${row.task_id}`));
    (jots ?? []).forEach((jot) => jot.profile_id && add(jot.profile_id, `jot:${jot.id}`));
    return bySpace;
  }, [jots, linkRows, noteRows, taskRows]);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!dropActive) setOverId(null);
  }, [dropActive]);

  const add = async (spaceId: string, keys: string[]) => {
    const added = await onAdd(spaceId, keys);
    if (added === 0) return;
    window.clearTimeout(timer.current);
    setJustAdded(spaceId);
    timer.current = window.setTimeout(() => setJustAdded(null), JUST_ADDED_MS);
  };

  const dropHandlers = (spaceId: string) => {
    const accepts = (event: DragEvent) => event.dataTransfer.types.includes(ITEM_DRAG_TYPE);
    const over = (event: DragEvent) => {
      if (!accepts(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      if (overId !== spaceId) setOverId(spaceId);
    };
    return {
      onDragEnter: over,
      onDragOver: over,
      onDragLeave: (event: DragEvent) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setOverId((current) => (current === spaceId ? null : current));
      },
      onDrop: (event: DragEvent) => {
        if (!accepts(event)) return;
        event.preventDefault();
        setOverId(null);
        const keys = parseDragKeys(event.dataTransfer.getData(ITEM_DRAG_TYPE));
        if (keys.length) void add(spaceId, keys);
      },
    };
  };

  const fileable = targetKeys.filter(isFileableKey);
  const { shown, more } = visibleSpacePills(spaces ?? [], selectedId);

  if (!spaces) {
    return (
      <div className="mc-pills" aria-busy="true" aria-label="Loading spaces…">
        <SpacePill name="All" plain on={allOn} to={hrefFor(null)} />
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className="mc-pill is-loading" aria-hidden="true">
            <span className="mc-pill-dot" />
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="mc-pills" role="group" aria-label={targetMode ? `Add ${targetKeys.length} to a space` : 'Spaces'}>
      {targetMode ? (
        <span className="mc-pills-label" aria-live="polite">
          Add <strong>{targetKeys.length}</strong> to…
        </span>
      ) : (
        <SpacePill name="All" plain on={allOn} to={hrefFor(null)} />
      )}
      {shown.map((space) => {
        const color = colors.get(space.id);
        if (targetMode) {
          const allIn = justAdded !== space.id && fileable.length > 0 && fileable.every((key) => held.get(space.id)?.has(key));
          const state = justAdded === space.id ? 'added' : allIn ? 'all-in' : overId === space.id ? 'over' : 'idle';
          return (
            <SpacePill
              key={space.id}
              name={space.name}
              color={color}
              target={state}
              onClick={() => void add(space.id, selectedItemKeys)}
              dropHandlers={dropHandlers(space.id)}
              ariaLabel={
                allIn
                  ? `${space.name} already has ${fileable.length === 1 ? 'it' : 'them all'}`
                  : `Add ${targetKeys.length} to ${space.name}`
              }
            />
          );
        }
        return (
          <SpacePill
            key={space.id}
            name={space.name}
            color={color}
            selected={space.id === selectedId}
            to={hrefFor(space.id === selectedId ? null : space.id)}
            dropHandlers={dropHandlers(space.id)}
            ariaLabel={space.id === selectedId ? `${space.name}, chosen. Show all` : undefined}
          />
        );
      })}
      {more.length > 0 && (
        <Menu
          label="More spaces"
          align="start"
          entries={more.map((space) => ({
            id: space.id,
            label: space.name,
            color: colors.get(space.id),
            onSelect: () => {
              if (targetMode) void add(space.id, selectedItemKeys);
              else navigate(hrefFor(space.id));
            },
          }))}
          trigger={(props) => (
            <button {...props} type="button" className="mc-pill is-plain">
              <MoreHorizontal aria-hidden="true" width={22} height={22} /> More
            </button>
          )}
        />
      )}
      {!targetMode && (
        <button type="button" className="mc-pill is-slot" onClick={onNewSpace} aria-label="New space" title="New space">
          <Plus aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

export default SpacePillRow;
