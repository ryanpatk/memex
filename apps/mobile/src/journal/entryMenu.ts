import { ActionSheetIOS, Alert, Platform } from 'react-native';
import type { Entry, FileableEntry, JournalSpace } from '@memex/core';
import type { EntryActions } from './useEntryActions';

/*
 * An entry's actions: the long-press menu (iOS action sheet) and the same
 * list as VoiceOver actions. Web equivalent: the hover actions and “File to…”.
 */

export interface MenuItem {
  /** VoiceOver action name. */
  name: string;
  label: string;
  destructive?: boolean;
  run: () => void;
}

/** An action sheet (iOS) or alert (elsewhere) of menu items; destructive ones in red. */
export const showMenu = (title: string, items: MenuItem[]) => {
  if (Platform.OS === 'ios') {
    const options = [...items.map((i) => i.label), 'Cancel'];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options,
        cancelButtonIndex: items.length,
        destructiveButtonIndex: items.flatMap((i, n) => (i.destructive ? [n] : [])),
      },
      (index) => items[index]?.run(),
    );
    return;
  }
  Alert.alert(title, undefined, [
    ...items.map((i) => ({ text: i.label, style: i.destructive ? ('destructive' as const) : ('default' as const), onPress: i.run })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
};

const pickSpace = (entry: FileableEntry, spaces: JournalSpace[], actions: EntryActions) => {
  const open = spaces.filter((s) => !entry.spaces.some((x) => x.id === s.id));
  if (!open.length) return;
  showMenu(
    'File in…',
    open.map((space) => ({ name: space.id, label: space.name, run: () => void actions.file(entry, space) })),
  );
};

export const entryMenuItems = (entry: Entry, spaces: JournalSpace[], actions: EntryActions): MenuItem[] => {
  const items: MenuItem[] = [];
  if (entry.kind === 'link') items.push({ name: 'open', label: 'Open', run: () => actions.openLink(entry.link.id) });
  if (entry.kind === 'note') items.push({ name: 'open', label: 'Open', run: () => actions.openNote(entry.note.id) });
  if (entry.kind === 'task')
    items.push({ name: 'toggle', label: entry.task.is_done ? 'Mark not done' : 'Mark done', run: () => void actions.toggleTask(entry.task) });
  if (entry.kind !== 'jot' && spaces.some((s) => !entry.spaces.some((x) => x.id === s.id)))
    items.push({ name: 'file', label: 'File in…', run: () => pickSpace(entry, spaces, actions) });
  items.push({ name: 'delete', label: 'Delete', destructive: true, run: () => actions.deleteEntry(entry) });
  return items;
};

export const showEntryMenu = (entry: Entry, title: string, spaces: JournalSpace[], actions: EntryActions) =>
  showMenu(title, entryMenuItems(entry, spaces, actions));
