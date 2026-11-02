import { useCallback } from 'react';
import { parseItemKey } from '@memex/core';
import {
  useAddLinksToProfile,
  useProfileLinkMembership,
  useRemoveLinkFromProfile,
  useSetProfileLinkSuperFavorite,
} from './useProfileLinks';
import { useAddNotesToProfile, useRemoveNoteFromProfile } from './useProfileNotes';
import { useAddTasksToProfile, useRemoveTaskFromProfile } from './useProfileTasks';
import { useProfiles } from './useProfiles';
import type { ToastAction } from './useFeedbackToast';
import { cue } from '../utils/sound';

type Flash = (message: string, action?: ToastAction) => void;

/**
 * Take stream items (by `${type}:${id}` key) out of a space: the other half
 * of useAddToSpace, used by “File to…” in the Journal and on space pages
 * (pressing a space that's already ticked). Toasts with Undo, which files
 * them back. Jots stay where they were written (they have no membership).
 */
export function useRemoveFromSpace(flash: Flash) {
  const { data: profiles } = useProfiles();
  const removeLink = useRemoveLinkFromProfile();
  const removeNote = useRemoveNoteFromProfile();
  const removeTask = useRemoveTaskFromProfile();
  const addLinks = useAddLinksToProfile();
  const addNotes = useAddNotesToProfile();
  const addTasks = useAddTasksToProfile();
  const { data: linkMembership } = useProfileLinkMembership();
  const setPin = useSetProfileLinkSuperFavorite();

  return useCallback(
    async (spaceId: string, keys: string[], label?: string) => {
      const name = (profiles ?? []).find((space) => space.id === spaceId)?.name ?? 'space';
      const parsed = Array.from(new Set(keys))
        .map(parseItemKey)
        .filter(({ type, id }) => (type === 'link' || type === 'note' || type === 'task') && !id.startsWith('temp-'));
      if (parsed.length === 0) return;
      const idsOf = (type: string) => parsed.filter((key) => key.type === type).map((key) => key.id);
      const linkIds = idsOf('link');
      const noteIds = idsOf('note');
      const taskIds = idsOf('task');
      // Links pinned in this space get their pin back on Undo
      const pinnedIds = linkIds.filter((linkId) =>
        (linkMembership ?? []).some((row) => row.profile_id === spaceId && row.link_id === linkId && row.is_super_favorite),
      );
      const what = label ? `“${label.length > 40 ? `${label.slice(0, 40)}…` : label}”` : parsed.length === 1 ? 'it' : `${parsed.length} items`;

      const write = Promise.all([
        ...linkIds.map((linkId) => removeLink.mutateAsync({ profileId: spaceId, linkId })),
        ...noteIds.map((noteId) => removeNote.mutateAsync({ profileId: spaceId, noteId })),
        ...taskIds.map((taskId) => removeTask.mutateAsync({ profileId: spaceId, taskId })),
      ]);

      let undone = false;
      const undo = async () => {
        if (undone) return;
        undone = true;
        try {
          await write;
        } catch {
          return; // nothing was removed; the failure toast already said so
        }
        try {
          await Promise.all([
            linkIds.length ? addLinks.mutateAsync({ profileId: spaceId, linkIds }) : null,
            noteIds.length ? addNotes.mutateAsync({ profileId: spaceId, noteIds }) : null,
            taskIds.length ? addTasks.mutateAsync({ profileId: spaceId, taskIds }) : null,
          ]);
          await Promise.all(
            pinnedIds.map((linkId) => setPin.mutateAsync({ profileId: spaceId, linkId, isSuperFavorite: true })),
          );
          cue('confirm');
          flash(`Put ${what} back in “${name}”.`);
        } catch (error) {
          console.error('Failed to undo taking out of a space:', error);
          cue('error');
          flash(`Couldn’t undo. ${what === 'it' ? 'It' : what} stays out of “${name}”.`);
        }
      };

      cue('move');
      flash(`Took ${what} out of “${name}”.`, { label: 'Undo', onClick: () => void undo() });
      try {
        await write;
      } catch (error) {
        console.error('Failed to take items out of a space:', error);
        cue('error');
        flash(`Couldn’t take that out of “${name}”. Try again.`);
      }
    },
    [addLinks, addNotes, addTasks, flash, linkMembership, profiles, removeLink, removeNote, removeTask, setPin],
  );
}
