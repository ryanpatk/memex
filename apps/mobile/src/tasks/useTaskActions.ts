import { useEffect, useMemo, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { dueLabel, type JournalSpace, type TaskWithTags } from '@memex/core';
import { useActions } from '../data/DataProvider';
import { useEntryActions } from '../journal/useEntryActions';
import { useToast } from '../ui/Toast';

/*
 * What the Tasks screen does, with the web's feedback (docs/tasks-view.md)
 * in native form: a ticked task holds in place for a beat before it moves to
 * Done, and the toast offers Undo; due dates and renames save at once and
 * roll back if the write fails. Writes are data/actions.ts.
 */

/** How long a ticked task stays in its group, checked, before moving to Done. */
export const HOLD_MS = 1000;

/** “today”, “tomorrow”, “Fri”, “Nov 12”: core's dueLabel, reading as part of a sentence. */
export const duePhrase = (due: string, now = new Date()) => {
  const label = dueLabel(due, now) ?? due;
  return /^(Today|Tomorrow|Yesterday)$/.test(label) ? label.toLowerCase() : label;
};

const clip = (text: string, max = 40) => (text.length > max ? `${text.slice(0, max)}…` : text);

export const useTaskActions = () => {
  const actions = useActions();
  const entryActions = useEntryActions();
  const toast = useToast();
  const [holding, setHolding] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const api = useMemo(() => {
    const fail = (message: string, error: unknown) => {
      console.warn(message, error);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show(message, { tone: 'error' });
    };
    const release = (id: string) => {
      const timer = timers.current.get(id);
      if (timer) clearTimeout(timer);
      timers.current.delete(id);
      setHolding((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    };
    const hold = (id: string) => {
      setHolding((prev) => new Set(prev).add(id));
      timers.current.set(id, setTimeout(() => release(id), HOLD_MS));
    };
    const setDone = async (task: TaskWithTags, done: boolean) => {
      try {
        await actions.setTaskDone(task, done);
        return true;
      } catch (error) {
        fail('Couldn’t update that task.', error);
        return false;
      }
    };

    return {
      /** Tick (holds, then moves to Done, with Undo) or reopen a done task. */
      async toggle(task: TaskWithTags) {
        if (task.id.startsWith('temp-')) return;
        const done = !task.is_done;
        void Haptics.impactAsync(done ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
        if (!done) {
          release(task.id);
          if (await setDone(task, false)) toast.show(`Reopened “${clip(task.title)}”.`);
          return;
        }
        hold(task.id);
        if (!(await setDone(task, true))) {
          release(task.id);
          return;
        }
        toast.show(`Done: ${clip(task.title)}`, {
          action: {
            label: 'Undo',
            onPress: () => {
              release(task.id);
              void setDone({ ...task, is_done: true }, false);
            },
          },
        });
      },

      /** Set or clear the due date (`YYYY-MM-DD` or null). */
      async setDue(task: TaskWithTags, due: string | null) {
        void Haptics.selectionAsync();
        try {
          await actions.setTaskDue(task, due);
          toast.show(due ? `Due ${duePhrase(due)}.` : 'No due date.');
        } catch (error) {
          fail('Couldn’t change the due date.', error);
        }
      },

      async rename(task: TaskWithTags, title: string) {
        try {
          await actions.renameTask(task, title);
        } catch (error) {
          fail('Couldn’t rename that task.', error);
        }
      },

      /** Add from the Tasks screen (core's parseTaskInput already ran). */
      async add(title: string, spaces: JournalSpace[]) {
        return entryActions.compose({ kind: 'task', title, spaces });
      },
    };
  }, [actions, entryActions, toast]);

  return { ...api, holding };
};

export type TaskActions = ReturnType<typeof useTaskActions>;
