import type { Note } from './types';
import { ACCEPTED_TLDS } from './tlds';

/** Scheme prepended when the user types a bare `domain.tld` with no scheme. */
const DEFAULT_SCHEME = 'http://';

/**
 * Normalizes paste/typed input to a URL string with scheme, or '' if it does
 * not look like a real URL.
 *
 * A value is accepted only when its hostname has at least two non-empty labels
 * and its final label (the TLD) is in the fixed allowlist. This keeps bare
 * words and arbitrary "word.word" text from being treated as URLs.
 */
export function normalizeUrlInput(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  // A valid host has no whitespace; bail early on anything spacey.
  if (/\s/.test(t)) return '';

  const candidate = t.includes('://') ? t : `${DEFAULT_SCHEME}${t}`;
  try {
    const u = new URL(candidate);
    const host = u.hostname.replace(/\.$/, '');
    if (!host) return '';

    const labels = host.split('.');
    if (labels.length < 2) return '';
    if (labels.some((label) => label.length === 0)) return '';

    const tld = labels[labels.length - 1].toLowerCase();
    if (!ACCEPTED_TLDS.has(tld)) return '';

    return candidate;
  } catch {
    return '';
  }
}

export function isUrlLike(raw: string): boolean {
  return normalizeUrlInput(raw) !== '';
}

/**
 * Lenient variant of `normalizeUrlInput` for converting saved notes back into
 * links: the user has explicitly asked, so any TLD-shaped final label (letters
 * or punycode) is accepted instead of the allowlist. Tolerates a markdown
 * autolink wrapper (`<https://…>`). Returns '' when it doesn't parse.
 */
export function normalizeLooseUrl(raw: string): string {
  const t = raw.trim().replace(/^<(.+)>$/, '$1');
  if (!t || /\s/.test(t)) return '';

  const candidate = t.includes('://') ? t : `${DEFAULT_SCHEME}${t}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    const labels = u.hostname.replace(/\.$/, '').split('.');
    if (labels.length < 2 || labels.some((label) => label.length === 0)) return '';

    const tld = labels[labels.length - 1].toLowerCase();
    if (!/^([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld)) return '';

    return candidate;
  } catch {
    return '';
  }
}

/**
 * The URL a note holds when its whole content is a single URL-shaped string
 * (title and body empty or identical) — typically a paste whose TLD the
 * omnibar allowlist didn't recognise. '' when the note is anything more.
 */
export function noteAsUrl(note: Pick<Note, 'title' | 'body'>): string {
  const parts = new Set(
    [note.title ?? '', note.body].map((part) => part.trim()).filter(Boolean),
  );
  if (parts.size !== 1) return '';
  return normalizeLooseUrl([...parts][0]);
}
