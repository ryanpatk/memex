/**
 * Return-after-sign-in: a signed-out visit to an app route goes to
 * `/auth/sign-in?next=<path>`, and signing in lands back on `<path>`.
 *
 * GitHub OAuth always comes back to `/dashboard` (the URL allow-listed in
 * Supabase Auth), so the target is also remembered in sessionStorage for a
 * few minutes and picked up there.
 */
import { DEFAULT_MODULE_PATH } from '../constants/modules';

export const SIGN_IN_PATH = '/auth/sign-in';
export const NEXT_PARAM = 'next';

const STORAGE_KEY = 'memex.auth.next';
const REMEMBER_MS = 10 * 60 * 1000;

/**
 * A same-origin app path, or null. Rejects absolute and protocol-relative URLs
 * (no open redirects) and the auth pages themselves (no loops).
 */
export const safeNextPath = (raw: string | null | undefined): string | null => {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  try {
    const url = new URL(raw, 'https://memex.invalid');
    if (url.origin !== 'https://memex.invalid') return null;
    if (url.pathname.startsWith('/auth/')) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
};

/** The sign-in URL that returns to `path` afterwards (plain sign-in for the home path). */
export const signInPathFor = (path: string): string => {
  const next = safeNextPath(path);
  if (!next || next === DEFAULT_MODULE_PATH) return SIGN_IN_PATH;
  return `${SIGN_IN_PATH}?${new URLSearchParams({ [NEXT_PARAM]: next })}`;
};

/** Where to go once signed in, read from the sign-in page's query string. */
export const nextPathFromSearch = (search: string): string =>
  safeNextPath(new URLSearchParams(search).get(NEXT_PARAM)) ?? DEFAULT_MODULE_PATH;

/** Remember the target across the GitHub OAuth round trip. */
export const rememberNextPath = (path: string) => {
  const next = safeNextPath(path);
  try {
    if (!next || next === DEFAULT_MODULE_PATH) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ path: next, at: Date.now() }));
  } catch {
    // storage unavailable: OAuth lands on the Journal, which is fine
  }
};

/** The remembered target if it's fresh, else the Journal. Doesn't clear it. */
export const readRememberedNextPath = (): string => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MODULE_PATH;
    const { path, at } = JSON.parse(raw) as { path?: string; at?: number };
    if (typeof at !== 'number' || Date.now() - at > REMEMBER_MS) return DEFAULT_MODULE_PATH;
    return safeNextPath(path) ?? DEFAULT_MODULE_PATH;
  } catch {
    return DEFAULT_MODULE_PATH;
  }
};

export const clearRememberedNextPath = () => {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to clear
  }
};
