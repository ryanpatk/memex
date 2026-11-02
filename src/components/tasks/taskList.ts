import type { KeyboardEvent, RefObject } from 'react';
import type { TaskWithTags } from '@memex/core';

/* Keyboard and focus helpers for lists of TaskRow (the Tasks view, a space's board). */

const isEditingTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

/**
 * Keys for a list of task rows: ↑/↓ (Home/End) move between rows, keeping
 * the column; Delete or Backspace deletes. Space ticks and Enter renames
 * natively (both are buttons).
 */
export const taskListKeyDown = (
  listRef: RefObject<HTMLElement | null>,
  findTask: (id: string) => TaskWithTags | undefined,
  onDelete: (task: TaskWithTags) => void,
) =>
  (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || isEditingTarget(event.target)) return;
    const target = event.target as HTMLElement;
    if (target.closest('[role="menu"]')) return;
    const row = target.closest<HTMLElement>('[data-task-row]');
    if (!row) return;
    const task = findTask(row.dataset.taskId ?? '');

    if ((event.key === 'Delete' || event.key === 'Backspace') && task) {
      event.preventDefault();
      onDelete(task);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-task-row]') ?? []);
    const index = rows.indexOf(row);
    const nextIndex =
      event.key === 'ArrowDown'
        ? Math.min(index + 1, rows.length - 1)
        : event.key === 'ArrowUp'
          ? Math.max(index - 1, 0)
          : event.key === 'Home'
            ? 0
            : rows.length - 1;
    event.preventDefault();
    const col = target.closest<HTMLElement>('[data-col]')?.dataset.col ?? 'check';
    const next = rows[nextIndex];
    (next.querySelector<HTMLElement>(`[data-col="${col}"]`) ?? next.querySelector<HTMLElement>('[data-col="check"]'))?.focus();
  };

/**
 * Where focus should go when a focused row leaves its list: the next row,
 * else the one before, else `fallback`. Returns null when focus isn't in it.
 */
export const nextFocusAfter = (list: HTMLElement | null, taskId: string, fallback: string): string | null => {
  const rows = Array.from(list?.querySelectorAll<HTMLElement>('[data-task-row]') ?? []);
  const index = rows.findIndex((row) => row.dataset.taskId === taskId);
  if (index === -1 || !rows[index].contains(document.activeElement)) return null;
  const next = rows[index + 1] ?? rows[index - 1];
  return next?.dataset.taskId ?? fallback;
};

/** Focus a row's check (after a neighbour left). */
export const focusTaskRow = (list: HTMLElement | null, taskId: string) =>
  list?.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(taskId)}"] [data-col="check"]`)?.focus();
