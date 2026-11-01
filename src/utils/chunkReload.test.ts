import { describe, expect, it } from 'vitest';
import { CHUNK_RELOAD_WINDOW_MS, isChunkLoadError, shouldReloadForChunk } from './chunkReload';

describe('isChunkLoadError', () => {
  it('recognises each browser’s missing-module message', () => {
    [
      new TypeError('Failed to fetch dynamically imported module: https://memex.app/assets/MarkdownEditor-abc.js'),
      new TypeError('error loading dynamically imported module: https://memex.app/assets/x.js'),
      new TypeError('Importing a module script failed.'),
      new Error('Unable to preload CSS for /assets/MarkdownEditor-abc.css'),
      new Error('Loading chunk 42 failed.'),
      "'text/html' is not a valid JavaScript MIME type.",
      new TypeError(
        'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".',
      ),
      Object.assign(new Error('whatever'), { name: 'ChunkLoadError' }),
    ].forEach((error) => expect(isChunkLoadError(error)).toBe(true));
  });

  it('ignores everything else', () => {
    [new Error('Network request failed'), new TypeError('x is undefined'), null, undefined, 42, {}, ''].forEach((error) =>
      expect(isChunkLoadError(error)).toBe(false),
    );
  });
});

describe('shouldReloadForChunk', () => {
  const now = 1_000_000;

  it('reloads the first time', () => {
    expect(shouldReloadForChunk(null, now)).toBe(true);
  });

  it('does not loop inside the window', () => {
    expect(shouldReloadForChunk(now - 1000, now)).toBe(false);
    expect(shouldReloadForChunk(now - CHUNK_RELOAD_WINDOW_MS, now)).toBe(false);
  });

  it('tries again after the window, or if the clock moved back', () => {
    expect(shouldReloadForChunk(now - CHUNK_RELOAD_WINDOW_MS - 1, now)).toBe(true);
    expect(shouldReloadForChunk(now + 5000, now)).toBe(true);
  });
});
