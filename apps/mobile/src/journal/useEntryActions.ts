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
import { useActions, useDeleteQueue } from '../data/DataProvider';
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

export const entryLabel = (entry: Entry) => {
  switch (entry.kind) {
    case 'jot':
      return clip(entry.jot.body);
    case 'link':
      return clip(getLinkTitle(entry.link));
    case 'note':
      return clip(noteDisplayTitle(entry.note));
    case 'task':
      return clip(entry.task.title);
  }
};

const names = (spaces: { name: string }[]) => spaces.map((s) => `“${s.name}”`).join(', ');

export const useEntryActions = () => {
  const actions = useActions();
  const deletes = useDeleteQueue();
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

      openLink(linkId: string) {
        if (linkId.startsWith('temp-')) return;
        router.push({ pathname: '/link/[id]', params: { id: linkId } });
      },
    };
  }, [actions, deletes, router, toast]);
};

export type EntryActions = ReturnType<typeof useEntryActions>;
