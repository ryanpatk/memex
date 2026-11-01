import { describe, expect, it } from 'vitest';
import { canonicalUrl, identifySource, isValidSourceId, legacyIdFragments, urlHasFragment } from './identify';

describe('identifySource', () => {
  it.each([
    ['https://x.com/jack/status/20', 'x', '20', 'https://x.com/jack/status/20'],
    ['https://twitter.com/jack/status/20?s=20&t=abc', 'x', '20', 'https://x.com/jack/status/20'],
    ['https://mobile.twitter.com/jack/status/20/photo/1', 'x', '20', 'https://x.com/jack/status/20'],
    ['https://x.com/i/web/status/20', 'x', '20', 'https://x.com/i/web/status/20'],
    ['https://x.com/i/status/20', 'x', '20', 'https://x.com/i/web/status/20'],
    ['https://www.pinterest.com/pin/123456/', 'pinterest', '123456', 'https://www.pinterest.com/pin/123456/'],
    ['https://uk.pinterest.co.uk/pin/123456', 'pinterest', '123456', 'https://www.pinterest.com/pin/123456/'],
    ['https://www.pinterest.com/pin/cozy-reading-nook--123456/', 'pinterest', '123456', 'https://www.pinterest.com/pin/123456/'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s', 'youtube', 'dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RD', 'youtube', 'dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=share', 'youtube', 'dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://www.youtube.com/live/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
  ])('%s → %s %s', (url, source, sourceId, canonical) => {
    const id = identifySource(url);
    expect(id.source).toBe(source);
    expect(id.sourceId).toBe(sourceId);
    expect(id.url).toBe(canonical);
  });

  it.each([
    'https://x.com/jack',
    'https://x.com/jack/status/notanid',
    'https://www.pinterest.com/ryan/boards/',
    'https://www.youtube.com/@channel',
    'https://www.youtube.com/watch?v=short',
    'https://youtube.com.evil.dev/watch?v=dQw4w9WgXcQ',
    'https://notx.com/a/status/1',
    'https://example.com/pin/123',
    'ftp://x.com/a/status/1',
    'not a url',
  ])('treats %s as the web, unchanged', (url) => {
    expect(identifySource(url)).toEqual({ source: 'web', sourceId: null, url, fallbackImage: null });
  });

  it('gives YouTube videos a thumbnail that always exists', () => {
    expect(identifySource('https://youtu.be/dQw4w9WgXcQ').fallbackImage).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
    expect(identifySource('https://x.com/a/status/1').fallbackImage).toBeNull();
  });
});

describe('source ids', () => {
  it('validates per platform', () => {
    expect(isValidSourceId('x', '1850000000000000001')).toBe(true);
    expect(isValidSourceId('x', '18a')).toBe(false);
    expect(isValidSourceId('pinterest', '123')).toBe(true);
    expect(isValidSourceId('youtube', 'dQw4w9WgXcQ')).toBe(true);
    expect(isValidSourceId('youtube', 'dQw4w9WgXc')).toBe(false);
    expect(isValidSourceId('youtube', "dQw4w9WgX'Q")).toBe(false);
  });

  it('builds canonical URLs', () => {
    expect(canonicalUrl('x', '1', 'jack')).toBe('https://x.com/jack/status/1');
    expect(canonicalUrl('x', '1')).toBe('https://x.com/i/web/status/1');
  });
});

describe('legacy id fragments', () => {
  it('lists the shapes an older row might use', () => {
    expect(legacyIdFragments('x', '1')).toEqual(['/status/1']);
    expect(legacyIdFragments('youtube', 'dQw4w9WgXcQ')).toContain('youtu.be/dQw4w9WgXcQ');
    expect(legacyIdFragments('web', null)).toEqual([]);
  });

  it('matches whole ids only', () => {
    expect(urlHasFragment('https://x.com/a/status/1', '/status/1')).toBe(true);
    expect(urlHasFragment('https://x.com/a/status/1?s=20', '/status/1')).toBe(true);
    expect(urlHasFragment('https://x.com/a/status/12', '/status/1')).toBe(false);
    expect(urlHasFragment('https://x.com/a/status/12/status/1', '/status/1')).toBe(true);
    expect(urlHasFragment('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1', 'v=dQw4w9WgXcQ')).toBe(true);
  });
});
