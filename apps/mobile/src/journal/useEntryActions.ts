import { useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import {
  getLinkTitle,
  noteDisplayTitle,
  type Entry,
  type FileableEntry,
  type JournalSpace,
  type TaskWithTags,
} from '@memex/core';
import { parseEntryId, type Composed } from '../data/actions';
import { useActions, useDeleteQueue, useDismissals } from '../data/DataProvider';
import { useToast } from '../ui/Toast';

/*
 * What you can do to the Journal from the phone, with the feedback the web
 * gives (toasts with Undo, cues) in native form (haptics, VoiceOver
 * announcements via the toast). The writes themselves are data/actions.ts.
 */

const clip = (text: string, max = 40) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

/** What an entry is called: a jot's text, a link's or note's title, a task's title. */
export const entryTitle = (entry: Entry) => {
  switch (entry.kind) {
    case 'jot':
      return entry.jot.body;
    case 'link':
      return getLinkTitle(entry.link);
    case 'note':
      return noteDisplayTitle(entry.note);
    case 'task':
      return entry.task.title;
  }
};

/** The title clipped for a toast or a menu's heading. */
export const entryLabel = (entry: Entry) => clip(entryTitle(entry));

const names = (spaces: { name: string }[]) => spaces.map((s) => `“${s.name}”`).join(', ');

export const useEntryActions = () => {
  const actions = useActions();
  const deletes = useDeleteQueue();
  const dismissals = useDismissals();
  const toast = useToast();
  const router = useRouter();

  return useMemo(() => {
    const fail = (message: string, error: unknown) => {
      console.warn(message, error);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show(message, { tone: 'error' });
    };

    const unfile = async (entry: FileableEntry, space: JournalSpace) => {
      const { kind, id } = parseEntryId(entry.id);
      try {
        void Haptics.selectionAsync();
        await actions.unfile(kind as FileableEntry['kind'], id, space.id);
      } catch (error) {
        fail(`Couldn’t take it out of “${space.name}”.`, error);
      }
    };

    return {
      /** Save the composer's text. Rejects (so the text goes back in the box) when nothing was saved. */
      async compose(result: Composed) {
        try {
          const outcome = await actions.compose(result);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          const failed = result.spaces.filter((s) => outcome.unfiled?.includes(s.id));
          if (failed.length) toast.show(`Saved, but couldn’t file it in ${names(failed)}.`, { tone: 'error' });
          else if (outcome.duplicate)
            toast.show(result.spaces.length ? `Already saved. Filed it in ${names(result.spaces)}.` : 'Already saved.');
          else if (outcome.kind === 'note') toast.show('Note saved.');
          return outcome;
        } catch (error) {
          fail('Couldn’t save that. Your text is back in the box.', error);
          throw error;
        }
      },

      async toggleTask(task: TaskWithTags) {
        if (task.id.startsWith('temp-')) return;
        void Haptics.impactAsync(task.is_done ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
        try {
          await actions.setTaskDone(task, !task.is_done);
        } catch (error) {
          fail('Couldn’t update that task.', error);
        }
      },

      /** Hide now, delete after the Undo window. */
      deleteEntry(entry: Entry) {
        if (parseEntryId(entry.id).id.startsWith('temp-')) return;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const undo = deletes.schedule(entry.id);
        toast.show(`Deleted “${entryLabel(entry)}”.`, {
          action: {
            label: 'Undo',
            onPress: () => {
              if (undo()) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            },
          },
        });
      },

      /** File in a space, with Undo. */
      async file(entry: FileableEntry, space: JournalSpace) {
        const { kind, id } = parseEntryId(entry.id);
        if (id.startsWith('temp-')) return;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        try {
          await actions.file(kind as FileableEntry['kind'], id, space.id);
          toast.show(`Filed in “${space.name}”.`, { action: { label: 'Undo', onPress: () => void unfile(entry, space) } });
        } catch (error) {
          fail(`Couldn’t file it in “${space.name}”.`, error);
        }
      },

      unfile,

      /** Hide the filer's suggestion for this entry on this phone (it stays unfiled), with Undo. */
      dismissSuggestion(entry: FileableEntry) {
        void Haptics.selectionAsync();
        dismissals.dismiss(entry.id);
        toast.show(`Left “${entryLabel(entry)}” unfiled.`, {
          action: { label: 'Undo', onPress: () => dismissals.restore(entry.id) },
        });
      },

      openLink(linkId: string) {
        if (linkId.startsWith('temp-')) return;
        router.push({ pathname: '/link/[id]', params: { id: linkId } });
      },

      openNote(noteId: string) {
        if (noteId.startsWith('temp-')) return;
        router.push({ pathname: '/note/[id]', params: { id: noteId } });
      },
    };
  }, [actions, deletes, dismissals, router, toast]);
};

export type EntryActions = ReturnType<typeof useEntryActions>;
