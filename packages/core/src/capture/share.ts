/*
 * What another app shared (the iOS share sheet, an Android share intent):
 * a URL, some text, or both, sometimes with the page's title. Decide whether
 * it's a link to save or text for the Journal, the way the composer would:
 * one http(s) URL with at most a short line around it is a link (the line
 * is kept as the note); anything longer, or several URLs, stays text.
 */
import { httpUrl, LIMITS } from './input';

export interface SharePayload {
  /** The shared text (often the URL itself, or "Title https://…"). */
  text?: string | null;
  /** The URL, when the sharing app sent one as a URL. */
  url?: string | null;
  /** The page title, when the sharing app gave one (Safari does). */
  title?: string | null;
}

export type SharedContent =
  | {
      kind: 'link';
      url: string;
      /** From the sharing app; null lets the scraper fill it. */
      title: string | null;
      /** Words shared around the URL ("Look at this"), offered as the note. */
      note: string | null;
    }
  | { kind: 'text'; text: string }
  | { kind: 'empty' };

/** Longest line kept next to a URL before the share counts as text. */
export const SHARE_NOTE_MAX = 200;
/** Longest shared text kept (a jot's sensible size). */
export const SHARE_TEXT_MAX = 10_000;

const URL_IN_TEXT = /https?:\/\/[^\s<>"'“”‘’]+/gi;

/** Trailing punctuation that belongs to the sentence, not the URL (keeps a `)` the URL opened). */
const trimUrl = (raw: string) => {
  let url = raw.replace(/[.,;:!?'"»”’\]}>]+$/, '');
  while (url.endsWith(')') && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) url = url.slice(0, -1);
  return url;
};

/** Every http(s) URL in the text, in order, without duplicates. */
export const urlsInText = (text: string): string[] => {
  const found = (text.match(URL_IN_TEXT) ?? []).map(trimUrl).filter((url) => httpUrl(url));
  return [...new Set(found)];
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const oneLine = (value: string) => value.replace(/\s+/g, ' ').trim();

/** "Look at this:" → "Look at this"; separators and wrapping quotes around a shared line go. */
const cleanNote = (value: string) =>
  oneLine(value)
    .replace(/^[\s\-–—|:·•]+|[\s\-–—|:·•]+$/g, '')
    .replace(/^["“'‘](.*)["”'’]$/, '$1')
    .trim();

const cleanTitle = (value: string | null | undefined) => {
  const title = typeof value === 'string' ? oneLine(value) : '';
  return title ? title.slice(0, LIMITS.title) : null;
};

export const parseSharedContent = (payload: SharePayload): SharedContent => {
  const text = typeof payload.text === 'string' ? payload.text.trim().slice(0, SHARE_TEXT_MAX) : '';
  const found = urlsInText(text);
  const given = httpUrl(payload.url);
  const url = given ?? (found.length === 1 ? found[0] : null);

  if (url) {
    const others = found.filter((u) => u !== url);
    // The URL goes, with the sentence punctuation that followed it.
    const rest = text ? cleanNote(text.replace(new RegExp(`${escapeRegExp(url)}[.,;:!?'"»”’\\]}>)]*`, 'g'), ' ')) : '';
    if (!others.length && rest.length <= SHARE_NOTE_MAX) {
      return { kind: 'link', url, title: cleanTitle(payload.title), note: rest || null };
    }
    // Long text with its link: keep it all as text (the URL too, if only sent separately).
    return { kind: 'text', text: text.includes(url) ? text : `${text}\n${url}` };
  }
  if (text) return { kind: 'text', text };
  return { kind: 'empty' };
};
