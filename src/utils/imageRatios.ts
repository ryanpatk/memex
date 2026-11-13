/*
 * Preview images' aspect ratios (height / width), learned the moment an image
 * reports its size and remembered in localStorage, so a card reserves its
 * final size before its picture arrives: exact on every visit after the
 * first, and a per-source guess (most og:images are 1200×630) before that.
 * A per-browser convenience only: losing it costs a few re-measured cards.
 */

const STORAGE_KEY = 'memex.imageRatios.v1';
/** Enough for a big Library; the oldest entries go first past this. */
const MAX_ENTRIES = 6000;

/** FNV-1a: short, stable keys, so thousands of entries stay a few tens of KB. */
const hashUrl = (url: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < url.length; i += 1) {
    hash ^= url.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

let ratios: Map<string, number> | null = null;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const load = (): Map<string, number> => {
  if (ratios) return ratios;
  ratios = new Map();
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, number>;
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'number' && value > 0 && Number.isFinite(value)) ratios.set(key, value);
      }
    }
  } catch {
    /* storage unavailable or corrupt: start empty */
  }
  return ratios;
};

const scheduleSave = () => {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const map = load();
    while (map.size > MAX_ENTRIES) map.delete(map.keys().next().value as string);
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(map)));
    } catch {
      /* quota or private mode: keep the in-memory copy */
    }
  }, 1500);
};

/** The remembered height/width ratio for an image URL, if it has been seen. */
export const getImageRatio = (url: string | null | undefined): number | undefined =>
  url ? load().get(hashUrl(url)) : undefined;

/** Records an image's natural size. Ignores no-ops so listeners only hear real changes. */
export const setImageRatio = (url: string, width: number, height: number) => {
  if (!(width > 0 && height > 0)) return;
  const ratio = Math.round((height / width) * 1000) / 1000;
  const map = load();
  const key = hashUrl(url);
  if (map.get(key) === ratio) return;
  map.delete(key); // re-insert so the newest entries survive trimming
  map.set(key, ratio);
  scheduleSave();
  listeners.forEach((listener) => listener());
};

export const subscribeImageRatios = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * A first guess before an image has reported its size, by where the link
 * came from: YouTube thumbnails are 16:9, pins run tall, and most other
 * previews are 1.91:1 og:images.
 */
export const guessImageRatio = (url: string, source?: string | null): number => {
  const where = `${source ?? ''} ${url}`.toLowerCase();
  if (/youtube|youtu\.be/.test(where)) return 0.5625;
  if (/pinterest|pinimg/.test(where)) return 1.4;
  if (/(^|[\s/.])x(\.com|:|\s|$)|twitter/.test(where)) return 0.5625;
  return 0.525;
};

/* Warming pictures ahead of the grid's render window, so they report their
   size (and sit in the HTTP cache) before their cards mount. A few at a time,
   newest request first: the grid asks for what's nearest the viewport. */
const MAX_IN_FLIGHT = 10;
const MAX_QUEUED = 200;
const inFlight = new Set<string>();
const failed = new Set<string>();
let queue: string[] = [];

const pump = () => {
  while (inFlight.size < MAX_IN_FLIGHT && queue.length) {
    const url = queue.shift() as string;
    if (inFlight.has(url) || getImageRatio(url) !== undefined || failed.has(url)) continue;
    inFlight.add(url);
    const img = new Image();
    img.decoding = 'async';
    let frame = 0;
    const done = (ok: boolean) => {
      if (!inFlight.has(url)) return;
      cancelAnimationFrame(frame);
      inFlight.delete(url);
      if (ok && img.naturalWidth > 0) setImageRatio(url, img.naturalWidth, img.naturalHeight);
      else if (!ok) failed.add(url);
      img.onload = img.onerror = null;
      pump();
    };
    // The size is known from the header, long before the last byte
    const poll = () => {
      if (img.naturalWidth > 0) done(true);
      else frame = requestAnimationFrame(poll);
    };
    img.onload = () => done(true);
    img.onerror = () => done(false);
    img.src = url;
    frame = requestAnimationFrame(poll);
  }
};

/** Learns these pictures' sizes in the background (the nearest first). */
export const prefetchImageRatios = (urls: readonly string[]) => {
  const wanted = urls.filter((url) => url && getImageRatio(url) === undefined && !failed.has(url) && !inFlight.has(url));
  if (!wanted.length) return;
  const wantedSet = new Set(wanted);
  queue = [...wanted, ...queue.filter((url) => !wantedSet.has(url))].slice(0, MAX_QUEUED);
  pump();
};

/* The ratio each picture's card is actually showing this session. A card
   only takes up a newly learned ratio while it sits below the viewport
   (useShownRatio): resizing anything at or above the screen would move the
   cards on screen. The grid lays out unmounted cards by this too, so a card
   scrolled off the top keeps the size it was shown at. */
const shownRatios = new Map<string, number>();

export const getShownRatio = (url: string | null | undefined): number | undefined =>
  url ? shownRatios.get(url) : undefined;

export const setShownRatio = (url: string, ratio: number) => {
  shownRatios.set(url, ratio);
};

/** The ratio a card should lay out at: what it shows, else what is known, else a guess. */
export const layoutRatio = (url: string, linkUrl: string, source?: string | null) =>
  getShownRatio(url) ?? getImageRatio(url) ?? guessImageRatio(linkUrl, source);
