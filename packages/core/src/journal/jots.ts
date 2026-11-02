import type { Part } from './feed';
import type { SelfMessage } from '../types';

/*
 * Jots in the desktop Journal (decision 17B, 2026-11-01): quick jots stack
 * into one thought, a jot can be edited in place, and jots are reachable from
 * ⌘K. Plain TS with no React; the web renders it in components/journal/.
 */

/* ------------------------------------------------------------------ */
/* Grouping (17B)                                                      */
/* ------------------------------------------------------------------ */

/** Jots written within this long of the one before read as one thought. */
export const JOT_GROUP_MS = 5 * 60_000;

/**
 * A feed part with its place in a thought. `cont`: it continues the jot above
 * (sits tight under it). `held`: the jot below continues it, so its time and
 * filing row wait for the end of the thought.
 */
export type FeedRow = { part: Part; cont: boolean; held: boolean };

const author = (jot: SelfMessage) => `${jot.captured_by ?? ''}\u0000${jot.captured_client ?? ''}`;

/**
 * Whether `next` continues `prev` as one thought: both jots, written within
 * JOT_GROUP_MS, in the same place (same space, or both unfiled) and by the
 * same hand (you, or the same agent). Day separators sit between days in the
 * parts list, so a thought never crosses midnight.
 */
export const continuesThought = (prev: Part | undefined, next: Part, groupMs = JOT_GROUP_MS): boolean => {
  if (!prev || prev.kind !== 'jot' || next.kind !== 'jot') return false;
  const gap = new Date(next.at).getTime() - new Date(prev.at).getTime();
  if (!(gap >= 0 && gap <= groupMs)) return false;
  if ((prev.jot.profile_id ?? null) !== (next.jot.profile_id ?? null)) return false;
  return author(prev.jot) === author(next.jot);
};

/** Feed parts as rows, with quick jots stacked into thoughts. */
export const groupJots = (parts: Part[], groupMs = JOT_GROUP_MS): FeedRow[] => {
  const rows = parts.map((part, i) => ({ part, cont: continuesThought(parts[i - 1], part, groupMs), held: false }));
  rows.forEach((row, i) => {
    if (rows[i + 1]?.cont) row.held = true;
  });
  return rows;
};

/* ------------------------------------------------------------------ */
/* Editing in place                                                    */
/* ------------------------------------------------------------------ */

export type JotEdit =
  /** Nothing to save (same text, give or take surrounding whitespace). */
  | { kind: 'unchanged' }
  /** Cleared: an edit can't empty a jot; Delete (with Undo) is how one goes. */
  | { kind: 'empty' }
  | { kind: 'save'; body: string };

/** What saving `draft` over a jot's `original` text should do. */
export const jotEdit = (original: string, draft: string): JotEdit => {
  const body = draft.trim();
  if (!body) return { kind: 'empty' };
  if (body === original.trim()) return { kind: 'unchanged' };
  return { kind: 'save', body };
};

/* ------------------------------------------------------------------ */
/* Finding jots (⌘K)                                                   */
/* ------------------------------------------------------------------ */

/** Lowercase without accents, so “cafe” finds “Café”. */
const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Queries shorter than this don't search jots (one letter matches nearly everything). */
export const JOT_SEARCH_MIN = 2;

/**
 * Jots containing every word of `query` (any order, case and accents
 * ignored), newest first, at most `limit`. Pending (temp-) jots are skipped:
 * they have nowhere to go yet.
 */
export const searchJots = (jots: SelfMessage[], query: string, limit = 6): SelfMessage[] => {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.join('').length < JOT_SEARCH_MIN) return [];
  return jots
    .filter((jot) => !jot.id.startsWith('temp-'))
    .filter((jot) => {
      const body = fold(jot.body);
      return words.every((word) => body.includes(word));
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
    .slice(0, limit);
};

/**
 * One line of a jot around the first match of `query`, about `max`
 * characters, with “…” where it was cut. Without a match it's the start.
 */
export const jotSnippet = (body: string, query: string, max = 80): string => {
  const line = body.replace(/\s+/g, ' ').trim();
  if (line.length <= max) return line;
  const word = fold(query).split(/\s+/).find(Boolean) ?? '';
  // fold() keeps lengths for precomposed Latin text; fall back to the start if it doesn't line up
  const folded = fold(line);
  const at = word && folded.length === line.length ? folded.indexOf(word) : -1;
  if (at < 0) return `${line.slice(0, max - 1).trimEnd()}…`;
  const start = Math.max(0, Math.min(at - Math.floor(max / 3), line.length - max));
  const end = Math.min(line.length, start + max);
  return `${start > 0 ? '…' : ''}${line.slice(start, end).trim()}${end < line.length ? '…' : ''}`;
};

/* ------------------------------------------------------------------ */
/* Moving jots between spaces                                          */
/* ------------------------------------------------------------------ */

/** One jot changing place: `from` / `to` are space ids, null for the Journal (unfiled). */
export type JotMove = { id: string; from: string | null; to: string | null };

/**
 * The moves that put the jots among `keys` (`jot:<id>` stream keys; others
 * are ignored) into `to` (a space id, or null to take them out of their
 * space). A jot lives in one place, so filing one moves it. Jots already
 * there, pending (temp-) jots and unknown ids are left out. `undoMoves`
 * reverses the result.
 */
export const planJotMoves = (jots: SelfMessage[], keys: string[], to: string | null): JotMove[] => {
  const byId = new Map(jots.map((jot) => [jot.id, jot]));
  const ids = new Set(keys.filter((key) => key.startsWith('jot:')).map((key) => key.slice(4)));
  return [...ids].flatMap((id) => {
    const jot = byId.get(id);
    if (!jot || id.startsWith('temp-')) return [];
    const from = jot.profile_id ?? null;
    return from === to ? [] : [{ id, from, to }];
  });
};

export const undoMoves = (moves: JotMove[]): JotMove[] => moves.map(({ id, from, to }) => ({ id, from: to, to: from }));
