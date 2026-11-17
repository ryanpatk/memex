import { parseComposer, type ComposerSpace } from '@memex/core';
import type { Composed } from '../data/actions';

/*
 * Save something (m05): which sheet is open and what it starts with
 * (captureStore, so the tab bar's + and Cards' search can open it), and
 * what Save makes (captureResult). Plain TS, tested.
 */

export type CaptureKind = 'jot' | 'note' | 'task';

interface CaptureState {
  key: number;
  text: string;
  kind: CaptureKind;
}

type Listener = () => void;
let current: CaptureState | null = null;
let seq = 0;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

/** Opens and closes the sheet from anywhere (the tab bar, Cards' search). */
export const captureStore = {
  get: () => current,
  open({ text = '', kind = 'jot' }: { text?: string; kind?: CaptureKind } = {}) {
    seq += 1;
    current = { key: seq, text, kind };
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

const TASK_PREFIX = /^\s*\[\s?\]\s/;

/** What Save makes: the text under the composer's rules for the chosen kind, filed in the picked spaces and any @spaces. */
export const captureResult = (text: string, kind: CaptureKind, spaces: ComposerSpace[], picked: readonly string[]): Composed | null => {
  const source = kind === 'task' && text.trim() && !TASK_PREFIX.test(text) ? `[] ${text.trim()}` : text;
  const parsed = parseComposer(source, spaces, kind === 'note');
  if (parsed.kind === 'empty') return null;
  const chosen = spaces.filter((s) => picked.includes(s.id)).map(({ id, name }) => ({ id, name }));
  const all = [...chosen, ...parsed.spaces];
  const merged = all.filter((s, i) => all.findIndex((o) => o.id === s.id) === i);
  return { ...parsed, spaces: merged } as Composed;
};
