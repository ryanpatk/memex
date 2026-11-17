/*
 * The one open menu (s07, m08): what showMenu asked for, held outside React
 * so plain functions (entryMenu, taskMenu) can open it; MenuHost renders it.
 * Plain TS.
 */

export interface MenuRow {
  /** VoiceOver action name, and the row's key. */
  name: string;
  label: string;
  destructive?: boolean;
  /** A space's colour: the row leads with its dot (“File in”). */
  dot?: string;
  /** Ticked: a check on the right (the space it's already in). */
  checked?: boolean;
  run: () => void;
}

export interface MenuSection {
  /** A quiet heading over the rows (“File in”). */
  header?: string;
  items: MenuRow[];
}

export interface MenuSpec {
  /** What the menu is about, for VoiceOver (the card's title). */
  title: string;
  sections: MenuSection[];
}

type Listener = () => void;

let current: MenuSpec | null = null;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

export const menuStore = {
  get: () => current,
  open(spec: MenuSpec) {
    const sections = spec.sections.filter((s) => s.items.length);
    if (!sections.length) return;
    current = { ...spec, sections };
    emit();
  },
  close() {
    if (!current) return;
    current = null;
    emit();
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
