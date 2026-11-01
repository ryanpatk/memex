/*
 * Normalized URLs: the dedupe fallback for links without a source id.
 * `normalizeUrlKey` maps the forms of one page to one key (stored in
 * `links.url_key`); `urlVariants` lists the spellings an older row (saved
 * before url_key existed) might have, so it can still be found by exact match.
 */

/** Query parameters that only track where a click came from. */
const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'msclkid', 'twclid', 'li_fat_id', 'mc_cid', 'mc_eid',
  'igshid', 'igsh', 'ref_src', 'ref_url', 'si', 'feature', 'pp', '_hsenc', '_hsmi', 'mkt_tok',
  'yclid', 'wt_mc', 'cmpid', 'spm', 'share_id', 'ttclid',
]);
const isTracking = (name: string) => {
  const key = name.toLowerCase();
  return key.startsWith('utm_') || TRACKING_PARAMS.has(key);
};

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const parseHttp = (url: string): URL | null => {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
};

/**
 * One key per page: scheme-less, lowercase host without `www.` or a default
 * port, path without trailing slashes, tracking parameters dropped, the rest
 * sorted, and the fragment dropped unless it is a hash route (`#/…`, `#!…`).
 * `http://www.Example.com/a/?utm_source=x&b=2&a=1#top` → `example.com/a?a=1&b=2`.
 * Returns null for anything that isn't an http(s) URL.
 */
export function normalizeUrlKey(url: string): string | null {
  const u = parseHttp(url);
  if (!u) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const port = u.port && !['80', '443'].includes(u.port) ? `:${u.port}` : '';
  const path = u.pathname.replace(/\/+$/, '');
  const params = u.search
    .replace(/^\?/, '')
    .split('&')
    .filter((pair) => pair && !isTracking(safeDecode(pair.split('=')[0] ?? '')))
    .sort();
  const query = params.length ? `?${params.join('&')}` : '';
  const hash = /^#[!/]/.test(u.hash) ? u.hash : '';
  return `${host}${port}${path}${query}${hash}`;
}

/**
 * Exact spellings an older row might have stored for the same page: the input
 * ± trailing slash, http ⇄ https, with and without `www.`. At most 9.
 */
export function urlVariants(url: string): string[] {
  const trimmed = url.trim();
  const u = parseHttp(trimmed);
  if (!u) return [trimmed];
  const rest = trimmed.replace(/^https?:\/\/[^/?#]+/i, '');
  const host = u.host.replace(/^www\./i, '');
  const out = new Set<string>([trimmed]);
  for (const scheme of ['https', 'http']) {
    for (const h of [host, `www.${host}`]) {
      const base = `${scheme}://${h}${rest}`;
      out.add(base);
      // Toggle a trailing slash only when there's no query or fragment after the path.
      if (!/[?#]/.test(rest)) out.add(base.endsWith('/') ? base.replace(/\/+$/, '') : `${base}/`);
    }
  }
  return [...out].slice(0, 9);
}
