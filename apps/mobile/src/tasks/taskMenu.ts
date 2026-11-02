import { Alert, Platform } from 'react-native';
import type { Entry, JournalSpace } from '@memex/core';
import { entryMenuItems, showMenu, type MenuItem } from '../journal/entryMenu';
import type { EntryActions } from '../journal/useEntryActions';
import type { TaskActions } from './useTaskActions';

/*
 * A task's menu on the Tasks screen (web: the row's ··· menu): Mark done,
 * Due date…, Rename…, Spaces… (every space, ticked where it's filed; each
 * press files or takes it out, with Undo), Delete (with Undo). Built on the
 * Journal's entry menu so both stay alike.
 */

type TaskEntry = Extract<Entry, { kind: 'task' }>;

/** Every space, ticked where the task is filed. */
export const spaceOptions = (entry: TaskEntry, spaces: JournalSpace[]) =>
  spaces.map((space) => {
    const filed = entry.spaces.some((s) => s.id === space.id);
    return { space, filed, label: filed ? `✓ ${space.name}` : space.name };
  });

export const taskMenuItems = (
  entry: TaskEntry,
  spaces: JournalSpace[],
  entryActions: EntryActions,
  taskActions: TaskActions,
  openDue: () => void,
): MenuItem[] => {
  const base = entryMenuItems(entry, spaces, entryActions).filter((i) => i.name !== 'file');
  const items = base.map((i) => (i.name === 'toggle' ? { ...i, run: () => void taskActions.toggle(entry.task) } : i));
  const extra: MenuItem[] = [{ name: 'due', label: 'Due date…', run: openDue }];
  if (Platform.OS === 'ios') {
    extra.push({
      name: 'rename',
      label: 'Rename…',
      run: () =>
        Alert.prompt(
          'Rename task',
          undefined,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Save', onPress: (value?: string) => void taskActions.rename(entry.task, value ?? '') },
          ],
          'plain-text',
          entry.task.title,
        ),
    });
  }
  if (spaces.length) {
    extra.push({
      name: 'spaces',
      label: 'Spaces…',
      run: () => {
        showMenu(
          'Spaces',
          spaceOptions(entry, spaces).map(({ space, filed, label }) => ({
            name: space.id,
            label,
            run: () => void (filed ? entryActions.unfile(entry, space) : entryActions.file(entry, space)),
          })),
        );
      },
    });
  }
  // Mark done first, Delete last.
  const del = items.filter((i) => i.name === 'delete');
  return [...items.filter((i) => i.name !== 'delete'), ...extra, ...del];
};
