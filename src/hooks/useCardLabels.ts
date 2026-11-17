import { useCallback, useMemo } from 'react';
import { useProfiles } from './useProfiles';
import { useProfileLinkMembership } from './useProfileLinks';
import { useProfileNoteMembership } from './useProfileNotes';
import { useProfileTaskMembership } from './useProfileTasks';
import { useAllSelfMessages } from './useSelfMessages';
import { useSpaceColors } from './useSpaceColors';
import type { CardLabel } from '../components/cards/LabelStrip';

const UNFILED: CardLabel = { name: null, color: null, extra: 0 };

/**
 * What each memory card's label strip says: an item key (`link:<id>`,
 * `note:<id>`, `task:<id>`, `jot:<id>`) → its first space's name and colour,
 * plus how many more spaces hold it. `preferSpaceId` (the space a page is
 * scoped to) leads when the item is in it.
 */
export const useCardLabels = (preferSpaceId?: string | null) => {
  const { data: profiles } = useProfiles();
  const colors = useSpaceColors();
  const { data: linkRows } = useProfileLinkMembership();
  const { data: noteRows } = useProfileNoteMembership();
  const { data: taskRows } = useProfileTaskMembership();
  const { data: jots } = useAllSelfMessages();

  const spacesByKey = useMemo(() => {
    const map = new Map<string, string[]>();
    const add = (key: string, spaceId: string) => {
      const list = map.get(key);
      if (list) list.push(spaceId);
      else map.set(key, [spaceId]);
    };
    (linkRows ?? []).forEach((row) => add(`link:${row.link_id}`, row.profile_id));
    (noteRows ?? []).forEach((row) => add(`note:${row.note_id}`, row.profile_id));
    (taskRows ?? []).forEach((row) => add(`task:${row.task_id}`, row.profile_id));
    (jots ?? []).forEach((jot) => {
      if (jot.profile_id) add(`jot:${jot.id}`, jot.profile_id);
    });
    return map;
  }, [jots, linkRows, noteRows, taskRows]);

  const spaceById = useMemo(() => new Map((profiles ?? []).map((space) => [space.id, space])), [profiles]);

  // One label object per key per render of the data, so memoized cards stay put
  const labelFor = useMemo(() => {
    const cache = new Map<string, CardLabel>();
    return (key: string): CardLabel => {
      const cached = cache.get(key);
      if (cached) return cached;
      const ids = (spacesByKey.get(key) ?? []).filter((id) => spaceById.has(id));
      let label = UNFILED;
      if (ids.length) {
        const first = preferSpaceId && ids.includes(preferSpaceId) ? preferSpaceId : ids[0];
        label = { name: spaceById.get(first)!.name, color: colors.get(first) ?? null, extra: ids.length - 1 };
      }
      cache.set(key, label);
      return label;
    };
  }, [colors, preferSpaceId, spaceById, spacesByKey]);

  const spacesOf = useCallback((key: string) => spacesByKey.get(key) ?? [], [spacesByKey]);

  return { labelFor, spacesOf };
};
