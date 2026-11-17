import { Alert, Platform } from 'react-native';
import type { Entry, JournalSpace } from '@memex/core';
import { entryMenuItems, showFileIn, type MenuItem } from '../journal/entryMenu';
import { entryLabel } from '../journal/useEntryActions';
import type { EntryActions } from '../journal/useEntryActions';
import type { TaskActions } from './useTaskActions';

/*
 * A task's menu on the Tasks screen (web: the row's ··· menu): Mark done,
 * Due date…, Rename…, Spaces… (the “File in” menu: every space, ticked where
 * it's filed; each press files or takes it out, with Undo), Delete (with
 * Undo). Built on the Journal's entry menu so both stay alike.
 */

type TaskEntry = Extract<Entry, { kind: 'task' }>;

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
      run: () => showFileIn(entry, entryLabel(entry), spaces, entryActions),
    });
  }
  // Mark done first, Delete last.
  const del = items.filter((i) => i.name === 'delete');
  return [...items.filter((i) => i.name !== 'delete'), ...extra, ...del];
};
