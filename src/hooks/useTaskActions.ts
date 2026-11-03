import { useCallback, useEffect, useRef, useState } from 'react';
import { dueDayKey, itemKey, type TaskWithTags } from '@memex/core';
import { useDeleteTask, useUpdateTask } from './useTasks';
import { useAddToSpace } from './useAddToSpace';
import { useRemoveFromSpace } from './useRemoveFromSpace';
import type { ToastAction } from './useFeedbackToast';
import { cue } from '../utils/sound';
import type { TaskRowHandlers } from '../components/tasks/TaskRow';

/*
 * What a task row can do, shared by the Tasks view and a space's board
 * (decision 14B) so both behave the same: ticking keeps the row in place for
 * a beat (`settling`), then it moves to Done, with Undo in the toast; deletes
 * hide at once and commit after the Undo window (leaving the page commits
 * them); filing toggles a space with Undo (the shared add/remove-from-space
 * hooks); rename and due dates write straight through. A failed tick,
 * rename, due date or delete is reported by the shell's fallback toast
 * (Providers' MutationCache), and the optimistic change rolls back.
 */

const UNDO_WINDOW_MS = 6000;
/** How long a ticked task stays in the open list, checked, before it moves to Done. */
const SETTLE_MS = 1100;

interface TaskActionsOptions {
  flash: (message: string, action?: ToastAction) => void;
  dismiss: () => void;
  /** Task id → the ids of the spaces it's filed in. */
  membership: Map<string, string[]>;
  /** Called just before a row leaves its list (ticked and settled, or deleted), so focus can move on. */
  beforeRowLeaves?: (taskId: string) => void;
}

export function useTaskActions({ flash, dismiss, membership, beforeRowLeaves }: TaskActionsOptions) {
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const addToSpace = useAddToSpace(flash);
  const removeFromSpace = useRemoveFromSpace(flash);

  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [settling, setSettling] = useState<Set<string>>(() => new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const settleTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingDeletes = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; commit: () => void }>());
  const leaving = useRef(beforeRowLeaves);
  leaving.current = beforeRowLeaves;

  useEffect(() => {
    const timers = settleTimers.current;
    const deletes = pendingDeletes.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      // Leaving the page commits anything still waiting for Undo
      deletes.forEach(({ timer, commit }) => {
        clearTimeout(timer);
        commit();
      });
      deletes.clear();
    };
  }, []);

  const unsettle = useCallback((id: string) => {
    const timer = settleTimers.current.get(id);
    if (timer) clearTimeout(timer);
    settleTimers.current.delete(id);
    setSettling((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const onToggle = useCallback(
    (task: TaskWithTags) => {
      if (task.id.startsWith('temp-')) return;
      cue('toggle');
      if (task.is_done) {
        // Unticking: a just-ticked row or one from the Done list
        unsettle(task.id);
        updateTask.mutate({ id: task.id, updates: { is_done: false } });
        flash(`Reopened “${task.title}”.`);
        return;
      }
      updateTask.mutate({ id: task.id, updates: { is_done: true } });
      setSettling((prev) => new Set(prev).add(task.id));
      settleTimers.current.set(
        task.id,
        setTimeout(() => {
          leaving.current?.(task.id);
          unsettle(task.id);
        }, SETTLE_MS),
      );
      flash(`Done: “${task.title}”.`, {
        label: 'Undo',
        onClick: () => {
          unsettle(task.id);
          updateTask.mutate({ id: task.id, updates: { is_done: false } });
          cue('confirm');
          dismiss();
        },
      });
    },
    [dismiss, flash, unsettle, updateTask],
  );

  const onRename = useCallback(
    (task: TaskWithTags, title: string) => {
      setRenamingId(null);
      const next = title.replace(/\s+/g, ' ').trim().slice(0, 200);
      if (!next || next === task.title || task.id.startsWith('temp-')) return;
      updateTask.mutate({ id: task.id, updates: { title: next } });
    },
    [updateTask],
  );

  const onSetDue = useCallback(
    (task: TaskWithTags, due: string | null) => {
      if (task.id.startsWith('temp-')) return;
      if ((dueDayKey(task.due_date) ?? null) === due) return;
      cue('toggle');
      updateTask.mutate({ id: task.id, updates: { due_date: due } });
    },
    [updateTask],
  );

  const onFileToggle = useCallback(
    (task: TaskWithTags, spaceId: string) => {
      if (task.id.startsWith('temp-')) return;
      const filed = (membership.get(task.id) ?? []).includes(spaceId);
      const key = itemKey('task', task.id);
      if (filed) void removeFromSpace(spaceId, [key], task.title);
      else void addToSpace(spaceId, [key]);
    },
    [addToSpace, membership, removeFromSpace],
  );

  const onDelete = useCallback(
    (task: TaskWithTags) => {
      if (task.id.startsWith('temp-')) return;
      leaving.current?.(task.id);
      cue('dismiss');
      const unhide = () =>
        setHidden((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      setHidden((prev) => new Set(prev).add(task.id));
      const commit = () => deleteTask.mutate(task.id, { onSettled: unhide });
      const timer = setTimeout(() => {
        pendingDeletes.current.delete(task.id);
        commit();
      }, UNDO_WINDOW_MS);
      pendingDeletes.current.set(task.id, { timer, commit });
      flash(`Deleted “${task.title}”.`, {
        label: 'Undo',
        onClick: () => {
          const pending = pendingDeletes.current.get(task.id);
          if (!pending) return;
          clearTimeout(pending.timer);
          pendingDeletes.current.delete(task.id);
          unhide();
          cue('confirm');
          dismiss();
        },
      });
    },
    [deleteTask, dismiss, flash],
  );

  const handlers: TaskRowHandlers = {
    onToggle,
    onRename,
    onStartRename: setRenamingId,
    onSetDue,
    onFileToggle,
    onDelete,
  };

  return { hidden, settling, renamingId, handlers };
}
