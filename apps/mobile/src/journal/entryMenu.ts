import type { Entry, FileableEntry, JournalSpace } from '@memex/core';
import { menuStore, type MenuRow, type MenuSection } from '../cards/menuStore';
import { entryLabel, type EntryActions } from './useEntryActions';

/*
 * An entry's actions: the long-press menu (m08: “File in” with every space,
 * ticked where it's filed, then Open / Mark done / Delete) and the same
 * actions as VoiceOver actions. Web equivalent: the card's ••• menu and
 * “File to…”.
 */

export type MenuItem = MenuRow;

/** Opens the menu (cards/MenuHost) with these rows; destructive ones in red under a rule. */
export const showMenu = (title: string, items: MenuItem[]) => {
  const main = items.filter((i) => !i.destructive);
  const danger = items.filter((i) => i.destructive);
  menuStore.open({ title, sections: [{ items: main }, { items: danger }] });
};

/** Every space, ticked where the entry is filed; a row files it there or takes it out (with Undo). */
export const fileInSection = (entry: FileableEntry, spaces: JournalSpace[], actions: EntryActions): MenuSection => ({
  header: 'File in',
  items: spaces.map((space) => {
    const filed = entry.spaces.some((s) => s.id === space.id);
    return {
      name: `space:${space.id}`,
      label: space.name,
      dot: space.color,
      checked: filed,
      run: () => void (filed ? actions.unfile(entry, space) : actions.file(entry, space)),
    };
  }),
});

/** “File in” on its own: the link page's pills and “+ Space”, the VoiceOver action. */
export const showFileIn = (entry: FileableEntry, title: string, spaces: JournalSpace[], actions: EntryActions) =>
  menuStore.open({ title, sections: [fileInSection(entry, spaces, actions)] });

export const entryMenuItems = (entry: Entry, spaces: JournalSpace[], actions: EntryActions): MenuItem[] => {
  const items: MenuItem[] = [];
  if (entry.kind === 'link') items.push({ name: 'open', label: 'Open', run: () => actions.openLink(entry.link.id) });
  if (entry.kind === 'note') items.push({ name: 'open', label: 'Open', run: () => actions.openNote(entry.note.id) });
  if (entry.kind === 'task')
    items.push({ name: 'toggle', label: entry.task.is_done ? 'Mark not done' : 'Mark done', run: () => void actions.toggleTask(entry.task) });
  if (entry.kind !== 'jot' && spaces.length)
    items.push({ name: 'file', label: 'File in…', run: () => showFileIn(entry, entryLabel(entry), spaces, actions) });
  items.push({ name: 'delete', label: 'Delete', destructive: true, run: () => actions.deleteEntry(entry) });
  return items;
};

/** The long-press menu: “File in” first (not for jots, which live in one space), then the rest. */
export const showEntryMenu = (entry: Entry, title: string, spaces: JournalSpace[], actions: EntryActions) => {
  const items = entryMenuItems(entry, spaces, actions).filter((i) => i.name !== 'file');
  menuStore.open({
    title,
    sections: [
      ...(entry.kind !== 'jot' && spaces.length ? [fileInSection(entry, spaces, actions)] : []),
      { items: items.filter((i) => !i.destructive) },
      { items: items.filter((i) => i.destructive) },
    ],
  });
};
