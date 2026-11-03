import { useCallback } from 'react';
import {
  useAddLinksToProfile,
  useProfileLinkMembership,
  useRemoveLinkFromProfile,
} from './useProfileLinks';
import {
  useAddNotesToProfile,
  useProfileNoteMembership,
  useRemoveNoteFromProfile,
} from './useProfileNotes';
import {
  useAddTasksToProfile,
  useProfileTaskMembership,
  useRemoveTaskFromProfile,
} from './useProfileTasks';
import { useProfiles } from './useProfiles';
import { useMoveJots } from './useMoveJots';
import type { ToastAction } from './useFeedbackToast';
import { parseItemKey, undoMoves } from '@memex/core';
import { cue } from '../utils/sound';
import { HANDLES_ERRORS } from '../utils/mutationErrors';

type Flash = (message: string, action?: ToastAction) => void;

/**
 * Add stream items (by `${type}:${id}` key) to a space. Shared by the sidebar
 * (spaces as bulk-assign and drop targets), the selection bar, the Journal's
 * “File to…” and the Tasks view, so all of them report the same way:
 * optimistic toast with Undo, "already there" counts, move cue. Undo takes
 * back out only what this call newly filed. Jots (`jot:<id>`) live in one
 * place, so filing one moves it here, and Undo moves it back to where it
 * was. Resolves to how many items were newly added (0 when they were all
 * already there).
 */
export function useAddToSpace(flash: Flash) {
  const { data: profiles } = useProfiles();
  const { data: linkMembership } = useProfileLinkMembership();
  const { data: noteMembership } = useProfileNoteMembership();
  const { data: taskMembership } = useProfileTaskMembership();
  // Every write below reports its own failure (and Undo's)
  const addLinks = useAddLinksToProfile(HANDLES_ERRORS);
  const addNotes = useAddNotesToProfile(HANDLES_ERRORS);
  const addTasks = useAddTasksToProfile(HANDLES_ERRORS);
  const removeLink = useRemoveLinkFromProfile(HANDLES_ERRORS);
  const removeNote = useRemoveNoteFromProfile(HANDLES_ERRORS);
  const removeTask = useRemoveTaskFromProfile(HANDLES_ERRORS);
  const jots = useMoveJots();

  return useCallback(
    async (spaceId: string, keys: string[]): Promise<number> => {
      const name = (profiles ?? []).find((space) => space.id === spaceId)?.name ?? 'space';

      const unique = Array.from(new Set(keys));
      const usable = unique.filter((key) => {
        const { type, id } = parseItemKey(key);
        return (type === 'link' || type === 'note' || type === 'task') && !id.startsWith('temp-');
      });
      // Jots: the ones that would move, and the ones already here
      const jotMoves = jots.plan(unique, spaceId);
      const jotsHere = jots.plan(unique, null).filter((move) => move.from === spaceId).length;

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
      const total = usable.length + jotMoves.length + jotsHere;
      const fresh = usable.filter((key) => !already.has(key));
      const newlyAdded = fresh.length + jotMoves.length;
      const onlyJots = usable.length === 0;
      const items = (n: number) => (onlyJots ? `${n === 1 ? 'the jot' : `${n} jots`}` : `${n} item${n === 1 ? '' : 's'}`);

      if (total === 0) return 0;
      if (newlyAdded === 0) {
        flash(`${total === 1 ? 'That item was' : 'Those items were'} already in “${name}”.`);
        return 0;
      }

      const idsOf = (type: string) =>
        fresh.map(parseItemKey).filter((key) => key.type === type).map((key) => key.id);
      const linkIds = idsOf('link');
      const noteIds = idsOf('note');
      const taskIds = idsOf('task');

      const write = Promise.all([
        linkIds.length > 0 ? addLinks.mutateAsync({ profileId: spaceId, linkIds }) : null,
        noteIds.length > 0 ? addNotes.mutateAsync({ profileId: spaceId, noteIds }) : null,
        taskIds.length > 0 ? addTasks.mutateAsync({ profileId: spaceId, taskIds }) : null,
        jotMoves.length > 0 ? jots.apply(jotMoves) : null,
      ]);

      let undone = false;
      const undo = async () => {
        if (undone) return;
        undone = true;
        try {
          await write;
        } catch {
          return; // nothing was filed; the failure toast already said so
        }
        try {
          // One removal per item: the same calls removing from a space always made
          await Promise.all([
            ...linkIds.map((linkId) => removeLink.mutateAsync({ profileId: spaceId, linkId })),
            ...noteIds.map((noteId) => removeNote.mutateAsync({ profileId: spaceId, noteId })),
            ...taskIds.map((taskId) => removeTask.mutateAsync({ profileId: spaceId, taskId })),
            jots.apply(undoMoves(jotMoves)),
          ]);
          cue('dismiss');
          flash(
            onlyJots
              ? `Moved ${newlyAdded === 1 ? 'it' : items(newlyAdded)} back.`
              : `Took ${newlyAdded === 1 ? 'it' : items(newlyAdded)} back out of “${name}”.`,
          );
        } catch (error) {
          console.error('Failed to undo filing:', error);
          cue('error');
          flash(`Couldn’t undo. Still in “${name}”.`);
        }
      };

      cue('move');
      const verb = onlyJots ? 'Moved' : 'Added';
      flash(
        newlyAdded === total
          ? `${verb} ${items(newlyAdded)} to “${name}”.`
          : `${verb} ${items(newlyAdded)} to “${name}” (${total - newlyAdded} already there).`,
        { label: 'Undo', onClick: () => void undo() },
      );

      try {
        await write;
      } catch (error) {
        console.error('Failed to add items to space:', error);
        cue('error');
        flash(`Couldn’t add to “${name}”. Try again.`);
        return 0;
      }
      return newlyAdded;
    },
    [
      addLinks,
      addNotes,
      addTasks,
      flash,
      jots,
      linkMembership,
      noteMembership,
      profiles,
      removeLink,
      removeNote,
      removeTask,
      taskMembership,
    ],
  );
}
