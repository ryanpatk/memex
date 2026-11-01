import { useCallback } from 'react';
import { useAddLinksToProfile, useProfileLinkMembership } from './useProfileLinks';
import { useAddNotesToProfile, useProfileNoteMembership } from './useProfileNotes';
import { useAddTasksToProfile, useProfileTaskMembership } from './useProfileTasks';
import { useProfiles } from './useProfiles';
import { parseItemKey } from '@memex/core';
import { cue } from '../utils/sound';

type Flash = (message: string) => void;

/**
 * Add stream items (by `${type}:${id}` key) to a space. Shared by the sidebar
 * (spaces as bulk-assign targets) and the selection bar, so both report the
 * same way: optimistic toast, "already there" counts, move cue. Resolves to
 * how many items were newly added (0 when they were all already there).
 */
export function useAddToSpace(flash: Flash) {
  const { data: profiles } = useProfiles();
  const { data: linkMembership } = useProfileLinkMembership();
  const { data: noteMembership } = useProfileNoteMembership();
  const { data: taskMembership } = useProfileTaskMembership();
  const addLinks = useAddLinksToProfile();
  const addNotes = useAddNotesToProfile();
  const addTasks = useAddTasksToProfile();

  return useCallback(
    async (spaceId: string, keys: string[]): Promise<number> => {
      const name = (profiles ?? []).find((space) => space.id === spaceId)?.name ?? 'space';

      const linkIds: string[] = [];
      const noteIds: string[] = [];
      const taskIds: string[] = [];
      const usable = keys.filter((key) => !parseItemKey(key).id.startsWith('temp-'));
      usable.forEach((key) => {
        const { type, id } = parseItemKey(key);
        if (type === 'link') linkIds.push(id);
        else if (type === 'note') noteIds.push(id);
        else if (type === 'task') taskIds.push(id);
      });

      const already = new Set<string>();
      (linkMembership ?? []).forEach((row) => {
        if (row.profile_id === spaceId) already.add(`link:${row.link_id}`);
      });
      (noteMembership ?? []).forEach((row) => {
        if (row.profile_id === spaceId) already.add(`note:${row.note_id}`);
      });
      (taskMembership ?? []).forEach((row) => {
        if (row.profile_id === spaceId) already.add(`task:${row.task_id}`);
      });
      const total = usable.length;
      const newlyAdded = usable.filter((key) => !already.has(key)).length;
      const items = (n: number) => `${n} item${n === 1 ? '' : 's'}`;

      if (newlyAdded === 0) {
        flash(`${total === 1 ? 'That item was' : 'Those items were'} already in “${name}”.`);
        return 0;
      }
      cue('move');
      flash(
        newlyAdded === total
          ? `Added ${items(newlyAdded)} to “${name}”.`
          : `Added ${items(newlyAdded)} to “${name}” (${total - newlyAdded} already there).`,
      );

      try {
        await Promise.all([
          linkIds.length > 0 ? addLinks.mutateAsync({ profileId: spaceId, linkIds }) : null,
          noteIds.length > 0 ? addNotes.mutateAsync({ profileId: spaceId, noteIds }) : null,
          taskIds.length > 0 ? addTasks.mutateAsync({ profileId: spaceId, taskIds }) : null,
        ]);
      } catch (error) {
        console.error('Failed to add items to space:', error);
        flash(`Couldn’t add to “${name}”. Try again.`);
        return 0;
      }
      return newlyAdded;
    },
    [addLinks, addNotes, addTasks, flash, linkMembership, noteMembership, profiles, taskMembership],
  );
}
