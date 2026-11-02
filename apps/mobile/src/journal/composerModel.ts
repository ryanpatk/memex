import {
  mentionQuery,
  sourceOf,
  type ComposerResult,
  type Entry,
  type Filer,
  type JournalSpace,
  type Suggestion,
} from '@memex/core';

/*
 * The composer's logic beyond core's parseComposer (which decides jot / link
 * / task / note and the @spaces): the @ picker, inserting a picked space,
 * and a filing suggestion for the draft from core's filer. Plain TS, tested.
 * Mirrors the web composer (components/journal/JournalComposer.tsx).
 */

export type Kind = Exclude<ComposerResult['kind'], 'empty'>;

/** What the send button does, for its label and the hint line. */
export const SEND_LABEL: Record<Kind, string> = {
  jot: 'Send jot',
  link: 'Save link',
  task: 'Add task',
  note: 'Save note',
};

export const KIND_HINT: Record<Kind, string> = {
  jot: 'Jot',
  link: 'Link',
  task: 'Task',
  note: 'Note',
};

/** The open @ picker: the partial name before the caret and the spaces it matches. */
export const pickerFor = (text: string, caret: number, spaces: JournalSpace[]) => {
  const query = mentionQuery(text.slice(0, caret));
  if (query === null) return null;
  const q = query.toLowerCase();
  // A finished mention ("@Kyoto trip") closes the picker so send sends.
  if (spaces.some((s) => s.name.toLowerCase() === q.trim())) return null;
  const matches = spaces.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 6);
  return matches.length ? { query, matches } : null;
};

/** Replace the `@partial` before the caret with `@Space Name `; returns the new text and caret. */
export const insertMention = (text: string, caret: number, query: string, space: JournalSpace) => {
  const before = text.slice(0, caret - query.length - 1);
  const after = text.slice(caret).replace(/^\s+/, '');
  const insert = `@${space.name} `;
  return { text: `${before}${insert}${after}`, caret: before.length + insert.length };
};

/** Append a mention for an accepted suggestion. */
export const appendMention = (text: string, space: JournalSpace) => {
  const trimmed = text.replace(/\s+$/, '');
  const next = `${trimmed}${trimmed ? ' ' : ''}@${space.name} `;
  return { text: next, caret: next.length };
};

/**
 * The draft as a Journal entry, so core's filer can suggest a space for it
 * the way it does for saved entries (named space, same site, a burst of
 * filing, similar titles). A jot is asked about as if it were a note, since
 * the filer only files items.
 */
export const draftEntry = (parsed: ComposerResult, now: Date): Entry | null => {
  const at = now.toISOString();
  const base = { user_id: '', created_at: at, updated_at: at, order_index: 0 };
  switch (parsed.kind) {
    case 'empty':
      return null;
    case 'link': {
      const link = { ...base, id: 'draft', project_id: '', url: parsed.url };
      return { kind: 'link', id: `draft:link:${parsed.url}`, at, link, spaces: [], source: sourceOf(link) };
    }
    case 'task':
      return { kind: 'task', id: `draft:task:${parsed.title}`, at, task: { ...base, id: 'draft', title: parsed.title, is_done: false }, spaces: [] };
    case 'jot':
      return { kind: 'note', id: `draft:note:${parsed.body}`, at, note: { ...base, id: 'draft', title: parsed.body, body: '' }, spaces: [] };
    case 'note':
      return { kind: 'note', id: `draft:note:${parsed.title}\n${parsed.body}`, at, note: { ...base, id: 'draft', title: parsed.title, body: parsed.body }, spaces: [] };
  }
};

/** A space to suggest for the draft, unless it already names one. */
export const draftSuggestion = (parsed: ComposerResult, filer: Filer | undefined, now: Date): Suggestion | undefined => {
  if (!filer || parsed.spaces.length) return undefined;
  const entry = draftEntry(parsed, now);
  return entry ? filer.suggest(entry) : undefined;
};

