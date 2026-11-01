/*
 * After a deploy, a tab opened on the previous build still points at the old
 * hashed bundles. The first lazy chunk it asks for (the note editor) is gone;
 * Workers static assets answer with index.html, the module fails to load and
 * the page comes up blank. When that happens, reload once to pick up the new
 * build. A second failure within the window means something else is wrong,
 * so the error is left to surface instead of looping.
 */

const STORAGE_KEY = 'memex.chunk-reload-at';
/** A reload attempt counts as “just tried” for this long. */
export const CHUNK_RELOAD_WINDOW_MS = 30_000;

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i, // Chromium
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /Unable to preload CSS/i, // Vite's CSS preload
  /Loading (CSS )?chunk [\w-]+ failed/i, // older bundlers / plugins
  /'text\/html' is not a valid JavaScript MIME type/i, // Safari, SPA fallback served for a .js
  /Expected a JavaScript(-or-Wasm)? module script/i, // Chromium, SPA fallback served for a .js
];

const messageOf = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
};

/** Whether an error (or rejection reason) is a missing script bundle. */
export const isChunkLoadError = (error: unknown): boolean => {
  if (error && typeof error === 'object' && (error as { name?: unknown }).name === 'ChunkLoadError') return true;
  const message = messageOf(error);
  return message !== '' && CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

/** Reload unless the last attempt was within the window (or the clock went backwards). */
export const shouldReloadForChunk = (lastAttemptAt: number | null, now: number): boolean =>
  lastAttemptAt === null || now - lastAttemptAt > CHUNK_RELOAD_WINDOW_MS || now < lastAttemptAt;

const readLastAttempt = (): number | null => {
  try {
    const value = Number(window.sessionStorage.getItem(STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};

/** Reload once for a missing chunk; returns whether a reload was started. */
export const reloadForChunkError = (error: unknown): boolean => {
  if (!isChunkLoadError(error)) return false;
  const now = Date.now();
  if (!shouldReloadForChunk(readLastAttempt(), now)) return false;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(now));
  } catch {
    // No session storage: still reload once; a loop is capped by the browser's own reload handling
  }
  window.location.reload();
  return true;
};

/**
 * Listen for missing chunks: Vite's `vite:preloadError` (fired for both
 * preload and import failures of lazy modules) and any unhandled rejection
 * that looks like one.
 */
export const installChunkReloadHandler = () => {
  window.addEventListener('vite:preloadError', (event) => {
    const payload = (event as Event & { payload?: unknown }).payload;
    // Stop Vite from rethrowing while the page reloads
    if (reloadForChunkError(payload ?? new Error('Failed to fetch dynamically imported module'))) {
      event.preventDefault();
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (reloadForChunkError(event.reason)) event.preventDefault();
  });
};
