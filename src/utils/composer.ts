import { normalizeUrlInput } from '@memex/core';

/*
 * The Journal composer's syntax (ROADMAP.md Phase 1). One field, and what you
 * type decides what Enter makes:
 *   plain text          → a jot
 *   a lone URL          → a link
 *   "[] " or "[ ] "     → a task
 *   ⌘/Ctrl+Enter        → a note (first line is the title)
 *   "@Space" anywhere   → files the result in that space
 * Plain TS, no React, so it can move to packages/core.
 */

export interface ComposerSpace {
  id: string;
  name: string;
}

export type ComposerResult =
  | { kind: 'empty'; spaces: ComposerSpace[] }
  | { kind: 'jot'; body: string; spaces: ComposerSpace[] }
  | { kind: 'link'; url: string; spaces: ComposerSpace[] }
  | { kind: 'task'; title: string; spaces: ComposerSpace[] }
  | { kind: 'note'; title: string; body: string; spaces: ComposerSpace[] };

const slug = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Pull `@Space` mentions out of the text. A mention matches a space's full
 * name (longest first, case-insensitive, spaces allowed) or its name with the
 * spaces and punctuation removed (`@joyfulsystems`).
 */
export const extractMentions = (text: string, spaces: ComposerSpace[]) => {
  const found: ComposerSpace[] = [];
  const byLength = [...spaces].sort((a, b) => b.name.length - a.name.length);
  let rest = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const atWordStart = i === 0 || /\s/.test(text[i - 1]);
    if (ch === '@' && atWordStart) {
      const after = text.slice(i + 1);
      const lower = after.toLowerCase();
      const match =
        byLength.find((s) => {
          const name = s.name.toLowerCase();
          return lower.startsWith(name) && !/[\p{L}\p{N}]/u.test(after.charAt(name.length));
        }) ??
        (() => {
          const token = /^[\p{L}\p{N}_-]+/u.exec(after)?.[0];
          return token ? spaces.find((s) => slug(s.name) === slug(token)) : undefined;
        })();
      if (match) {
        const nameMatch = lower.startsWith(match.name.toLowerCase());
        const length = nameMatch ? match.name.length : (/^[\p{L}\p{N}_-]+/u.exec(after)?.[0].length ?? 0);
        if (!found.some((s) => s.id === match.id)) found.push(match);
        i += 1 + length;
        continue;
      }
    }
    rest += ch;
    i += 1;
  }
  return { text: rest.replace(/[ \t]{2,}/g, ' ').trim(), spaces: found };
};

/** The unfinished `@partial` right before the caret, for the space picker. */
export const mentionQuery = (beforeCaret: string): string | null => {
  const m = /(?:^|\s)@([^@\n]{0,40})$/.exec(beforeCaret);
  return m ? m[1] : null;
};

export const parseComposer = (raw: string, spaces: ComposerSpace[], asNote = false): ComposerResult => {
  const { text, spaces: filed } = extractMentions(raw, spaces);
  if (!text) return { kind: 'empty', spaces: filed };

  if (asNote) {
    const firstLine = text.split('\n')[0].trim();
    const title = firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
    const body = text === firstLine && firstLine.length <= 80 ? '' : text;
    return { kind: 'note', title, body, spaces: filed };
  }

  const task = /^\[\s?\]\s+([\s\S]+)$/.exec(text);
  if (task) return { kind: 'task', title: task[1].replace(/\s+/g, ' ').trim().slice(0, 200), spaces: filed };

  const url = normalizeUrlInput(text);
  if (url) return { kind: 'link', url, spaces: filed };

  return { kind: 'jot', body: text, spaces: filed };
};
