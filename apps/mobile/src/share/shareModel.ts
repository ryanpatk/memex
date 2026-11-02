import {
  extractMentions,
  identifySource,
  parseComposer,
  parseSharedContent,
  SOURCES,
  type Entry,
  type JournalSpace,
  type SharedContent,
  type SharePayload,
} from '@memex/core';
import type { Composed } from '../data/actions';

/*
 * The share sheet's logic, plain TS. What arrived is decided by core
 * (parseSharedContent: link or text); what Save makes is decided by core's
 * composer rules (parseComposer for shared text, extractMentions for the
 * note's @spaces), and links are captured with `captured_by: 'share'`
 * through the same actions.compose → capture service as the composer.
 */

/** What expo-share-intent hands over (its ShareIntent, the fields we read). */
export interface ShareIntentLike {
  text?: string | null;
  webUrl?: string | null;
  meta?: { title?: string | null } | null;
}

export const payloadFromIntent = (intent: ShareIntentLike): SharePayload => ({
  text: intent.text ?? null,
  url: intent.webUrl ?? null,
  title: intent.meta?.title ?? null,
});

/** `memex://share?url=…&text=…&title=…` (also how the simulator reaches the sheet). */
export const payloadFromParams = (params: { url?: string | string[]; text?: string | string[]; title?: string | string[] }): SharePayload => {
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;
  return { url: one(params.url), text: one(params.text), title: one(params.title) };
};

export const sharedFrom = (payload: SharePayload): SharedContent => parseSharedContent(payload);

/** Spaces with the most recent activity first (what you filed in lately), then the rest in their order. */
export const recentSpaces = (spaces: JournalSpace[], entries: Entry[]): JournalSpace[] => {
  const last = new Map<string, string>();
  entries.forEach((entry) =>
    entry.spaces.forEach((s) => {
      const seen = last.get(s.id);
      if (!seen || entry.at > seen) last.set(s.id, entry.at);
    }),
  );
  return spaces
    .map((space, index) => ({ space, index, at: last.get(space.id) ?? '' }))
    .sort((a, b) => (a.at === b.at ? a.index - b.index : a.at < b.at ? 1 : -1))
    .map((s) => s.space);
};

/** Picked chip first (a jot lives in one space), then the @spaces typed, once each. */
const mergeSpaces = (picked: JournalSpace | null, mentioned: { id: string; name: string }[]) => {
  const all = [...(picked ? [picked] : []), ...mentioned];
  return all.filter((s, i) => all.findIndex((o) => o.id === s.id) === i).map(({ id, name }) => ({ id, name }));
};

/**
 * What Save makes. A link: the shared URL with the page title, the note
 * (minus its @spaces) as why you saved it, `captured_by: 'share'`. Text:
 * the field run through the composer's rules (a jot; `[] ` a task; a lone
 * URL a link; a note when asked). Null when there's nothing to save.
 */
export const shareResult = (
  content: SharedContent,
  field: string,
  spaces: JournalSpace[],
  picked: JournalSpace | null,
  asNote = false,
): Composed | null => {
  if (content.kind === 'empty') return null;
  if (content.kind === 'link') {
    const { spaces: mentioned, text } = extractMentions(field, spaces);
    const note = text.replace(/\s+/g, ' ').trim();
    return {
      kind: 'link',
      url: content.url,
      title: content.title,
      note: note || null,
      capturedBy: 'share',
      spaces: mergeSpaces(picked, mentioned),
    };
  }
  const parsed = parseComposer(field, spaces, asNote);
  if (parsed.kind === 'empty') return null;
  const merged = { ...parsed, spaces: mergeSpaces(picked, parsed.spaces) } as Composed;
  return merged.kind === 'link' ? { ...merged, capturedBy: 'share' } : merged;
};

export const SAVE_LABEL: Record<Composed['kind'], string> = {
  link: 'Save link',
  jot: 'Save jot',
  task: 'Add task',
  note: 'Save note',
};

/** Where it'll land, in words. */
export const destination = (result: Composed | null) => {
  if (!result) return 'Nothing to save yet';
  if (!result.spaces.length) return 'In your Journal';
  const names = result.spaces.map((s) => s.name);
  return result.kind === 'jot' ? `In ${names[0]}` : `In your Journal, filed in ${names.join(', ')}`;
};

/** The platform a shared link comes from, for its chip (null for the open web). */
export const linkSource = (url: string) => {
  const { source } = identifySource(url);
  return source === 'web' ? null : SOURCES[source]?.label ?? null;
};
