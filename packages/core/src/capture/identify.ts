/*
 * Which platform item a URL points at (CONTEXT.md → Source, Source id).
 * `(source, sourceId)` is the dedupe key; the canonical URL is what memex
 * stores for platform items, so two shapes of one post become one link.
 */
import type { SourceKey } from '../sources';

export type PlatformKey = Exclude<SourceKey, 'web'>;

export interface Identified {
  source: SourceKey;
  /** The platform's own id (post / pin / video id); null for the open web. */
  sourceId: string | null;
  /** The URL to store: canonical for platform items, the input otherwise. */
  url: string;
  /** A picture that always exists for this item (YouTube thumbnails), if any. */
  fallbackImage: string | null;
}

/** What a valid id looks like on each platform. */
export const SOURCE_ID_PATTERNS: Readonly<Record<PlatformKey, RegExp>> = {
  x: /^\d{1,25}$/,
  pinterest: /^\d{1,25}$/,
  youtube: /^[A-Za-z0-9_-]{11}$/,
};

export const isValidSourceId = (source: PlatformKey, id: string) => SOURCE_ID_PATTERNS[source].test(id);

const parse = (url: string): URL | null => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null;
  } catch {
    return null;
  }
};

const X_HOST = /^(?:www\.|mobile\.)?(?:x|twitter)\.com$/i;
const PINTEREST_HOST = /^(?:[a-z]{2,3}\.|www\.)?pinterest\.(?:com|[a-z]{2,3}(?:\.[a-z]{2})?)$/i;
const YOUTUBE_HOST = /^(?:www\.|m\.|music\.)?youtube(?:-nocookie)?\.com$/i;

/** The canonical URL memex stores for a platform item. */
export function canonicalUrl(source: PlatformKey, id: string, handle?: string | null): string {
  switch (source) {
    case 'x':
      return handle ? `https://x.com/${handle}/status/${id}` : `https://x.com/i/web/status/${id}`;
    case 'pinterest':
      return `https://www.pinterest.com/pin/${id}/`;
    case 'youtube':
      return `https://www.youtube.com/watch?v=${id}`;
  }
}

const platform = (source: PlatformKey, id: string, handle?: string | null): Identified => ({
  source,
  sourceId: id,
  url: canonicalUrl(source, id, handle),
  fallbackImage: source === 'youtube' ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null,
});

/**
 * Identify a URL. X posts (`x.com/<handle>/status/<id>`, `twitter.com/i/web/status/<id>`),
 * Pinterest pins (`pinterest.com/pin/<id>/`, any country domain) and YouTube videos (`watch?v=`, `youtu.be/`,
 * `/shorts/`, `/embed/`, `/live/`) get a source id; everything else is `web`.
 */
export function identifySource(url: string): Identified {
  const web: Identified = { source: 'web', sourceId: null, url, fallbackImage: null };
  const u = parse(url);
  if (!u) return web;
  const host = u.hostname;
  const segments = u.pathname.split('/').filter(Boolean);

  if (X_HOST.test(host)) {
    const at = segments.indexOf('status');
    const id = at > 0 ? segments[at + 1] : undefined;
    if (id && isValidSourceId('x', id)) {
      const handle = at === 1 && /^[A-Za-z0-9_]{1,15}$/.test(segments[0]) && segments[0] !== 'i' ? segments[0] : null;
      return platform('x', id, handle);
    }
    return web;
  }

  if (PINTEREST_HOST.test(host) || host === 'pin.it') {
    if (segments[0] === 'pin' && segments[1]) {
      // `/pin/<id>/` and the occasional slugged `/pin/some-title--<id>/`.
      const id = segments[1].match(/^(?:.*--)?(\d{1,25})$/)?.[1];
      if (id) return platform('pinterest', id);
    }
    return web;
  }

  if (YOUTUBE_HOST.test(host)) {
    const v = u.searchParams.get('v');
    if (segments[0] === 'watch' && v && isValidSourceId('youtube', v)) return platform('youtube', v);
    if (['shorts', 'embed', 'live', 'v'].includes(segments[0] ?? '') && segments[1] && isValidSourceId('youtube', segments[1])) {
      return platform('youtube', segments[1]);
    }
    return web;
  }

  if (/^(?:www\.)?youtu\.be$/i.test(host) && segments[0] && isValidSourceId('youtube', segments[0])) {
    return platform('youtube', segments[0]);
  }

  return web;
}

/**
 * Substrings that identify a platform item inside a stored URL, for rows saved
 * before `source_id` existed. A hit must be followed by the end of the URL or
 * one of `/ ? & #` (see `urlHasFragment`), so `/status/1` never matches `/status/12`.
 */
export function legacyIdFragments(source: SourceKey, id: string | null): string[] {
  if (!id) return [];
  switch (source) {
    case 'x':
      return [`/status/${id}`];
    case 'pinterest':
      return [`/pin/${id}`, `--${id}`];
    case 'youtube':
      return [`v=${id}`, `youtu.be/${id}`, `/shorts/${id}`, `/embed/${id}`, `/live/${id}`];
    default:
      return [];
  }
}

/** True when `url` contains `fragment` followed by end / `/` / `?` / `&` / `#`. */
export function urlHasFragment(url: string, fragment: string): boolean {
  let from = 0;
  for (;;) {
    const at = url.indexOf(fragment, from);
    if (at < 0) return false;
    const next = url[at + fragment.length];
    if (next === undefined || '/?&#'.includes(next)) return true;
    from = at + 1;
  }
}
