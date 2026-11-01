import { describe, expect, it } from 'vitest';
import { httpUrl, isUuid, parseCaptureInput, parseSourceTag, type ParseCaptureOptions } from './input';

const SPACE = '6f1c2a4e-1d2b-4c3d-8e9f-0a1b2c3d4e5f';
const TAG = 'A0B1C2D3-E4F5-4677-8899-AABBCCDDEEFF';
const API: ParseCaptureOptions = { defaultCapturedBy: 'api', allowedCapturedBy: ['extension', 'resync', 'share', 'api'] };

const ok = (body: unknown, options = API) => {
  const r = parseCaptureInput(body, options);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const err = (body: unknown, options = API) => {
  const r = parseCaptureInput(body, options);
  if (r.ok) throw new Error('expected an error');
  return r.error;
};

describe('isUuid', () => {
  it('accepts canonical UUIDs only', () => {
    expect(isUuid(SPACE)).toBe(true);
    expect(isUuid(TAG)).toBe(true);
    expect(isUuid('6f1c2a4e1d2b4c3d8e9f0a1b2c3d4e5f')).toBe(false);
    expect(isUuid(`${SPACE},user_id.neq.x`)).toBe(false);
    expect(isUuid(`${SPACE})`)).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});

describe('httpUrl', () => {
  it('accepts http(s) URLs within the limit', () => {
    expect(httpUrl(' https://example.com/a ')).toBe('https://example.com/a');
    expect(httpUrl('javascript:alert(1)')).toBeNull();
    expect(httpUrl('https://exa mple.com')).toBeNull();
    expect(httpUrl(`https://example.com/${'a'.repeat(2048)}`)).toBeNull();
    expect(httpUrl(['https://example.com'])).toBeNull();
  });
});

describe('parseSourceTag', () => {
  it('reads legacy tags and plain platforms', () => {
    expect(parseSourceTag('x:bookmark')).toEqual({ source: 'x', lists: ['bookmarked'], capturedBy: 'extension' });
    expect(parseSourceTag('pinterest:save')).toEqual({ source: 'pinterest', lists: ['saved'], capturedBy: 'extension' });
    expect(parseSourceTag('youtube:like')).toEqual({ source: 'youtube', lists: ['liked'], capturedBy: 'extension' });
    expect(parseSourceTag('extension')).toEqual({ source: null, lists: [], capturedBy: 'extension' });
    expect(parseSourceTag('youtube')).toEqual({ source: 'youtube', lists: [], capturedBy: null });
    expect(parseSourceTag(null)).toEqual({ source: null, lists: [], capturedBy: null });
  });
});

describe('parseCaptureInput', () => {
  it('derives platform, id and canonical URL from the URL', () => {
    const v = ok({ url: 'https://youtu.be/dQw4w9WgXcQ?si=x', source: 'youtube', sourceId: 'dQw4w9WgXcQ', list: 'liked', capturedBy: 'extension', client: 'memex-extension/0.3.0' });
    expect(v).toMatchObject({
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      source: 'youtube',
      sourceId: 'dQw4w9WgXcQ',
      lists: ['liked'],
      capturedBy: 'extension',
      client: 'memex-extension/0.3.0',
    });
  });

  it('finds the id even when the client sends none', () => {
    expect(ok({ url: 'https://twitter.com/jack/status/20' })).toMatchObject({ source: 'x', sourceId: '20', capturedBy: 'api' });
  });

  it('understands v0.2 extension payloads', () => {
    expect(ok({ url: 'https://x.com/jack/status/20', source: 'x:bookmark' })).toMatchObject({
      source: 'x',
      lists: ['bookmarked'],
      capturedBy: 'extension',
    });
    expect(ok({ url: 'https://example.com', source: 'extension' })).toMatchObject({ source: 'web', capturedBy: 'extension', lists: [] });
  });

  it('rejects a source or id that disagrees with the URL', () => {
    expect(err({ url: 'https://example.com', source: 'x' })).toMatch(/not a x item/);
    expect(err({ url: 'https://example.com', sourceId: '1' })).toMatch(/only accepted/);
    expect(err({ url: 'https://x.com/a/status/1', sourceId: '2' })).toMatch(/does not match/);
    expect(err({ url: 'https://x.com/a/status/1', sourceId: '1 or 1=1' })).toMatch(/Invalid x sourceId/);
    expect(err({ url: 'https://example.com', source: 'myspace' })).toMatch(/Unknown source/);
    expect(err({ url: 'https://example.com', source: 'X;drop' })).toMatch(/Invalid source/);
  });

  it('validates lists', () => {
    expect(ok({ url: 'https://x.com/a/status/1', lists: ['bookmarked', 'liked', 'bookmarked'] }).lists).toEqual(['bookmarked', 'liked']);
    expect(err({ url: 'https://example.com', list: 'watch-later' })).toMatch(/Unknown list/);
    expect(err({ url: 'https://example.com', lists: 'liked' })).toMatch(/must be an array/);
  });

  it('only lets clients claim the capturedBy values the caller allows', () => {
    expect(err({ url: 'https://example.com', capturedBy: 'agent' })).toMatch(/not allowed/);
    expect(err({ url: 'https://example.com', capturedBy: 'robot' })).toMatch(/Unknown capturedBy/);
    const mcp = { defaultCapturedBy: 'agent' as const, defaultClient: 'claude-code' };
    expect(ok({ url: 'https://example.com', source: 'extension' }, mcp)).toMatchObject({ capturedBy: 'agent', client: 'claude-code' });
  });

  it('requires UUIDs for space and tag ids', () => {
    expect(ok({ url: 'https://example.com', spaceId: SPACE, tagIds: [TAG, TAG.toLowerCase()] })).toMatchObject({
      spaceId: SPACE,
      tagIds: [TAG.toLowerCase()],
    });
    expect(ok({ url: 'https://example.com', spaceId: '' }).spaceId).toBeNull();
    expect(err({ url: 'https://example.com', spaceId: 'abc' })).toMatch(/spaceId must be a UUID/);
    expect(err({ url: 'https://example.com', spaceId: `${SPACE}&user_id=neq.x` })).toMatch(/spaceId must be a UUID/);
    expect(err({ url: 'https://example.com', tagIds: [TAG, 'x)'] })).toMatch(/tagIds must be UUIDs/);
    expect(err({ url: 'https://example.com', tagIds: TAG })).toMatch(/must be an array/);
    expect(err({ url: 'https://example.com', tagIds: Array(21).fill(TAG) })).toMatch(/At most 20/);
  });

  it('trims and caps text, keeps only http(s) images, prefers the note', () => {
    const v = ok({
      url: 'https://example.com',
      title: `  ${'t'.repeat(600)}  `,
      description: 'page description',
      note: ' why I saved it ',
      image: 'data:image/png;base64,AAAA',
      favicon: 'https://example.com/favicon.ico',
    });
    expect(v.title).toHaveLength(500);
    expect(v.description).toBe('why I saved it');
    expect(v.image).toBeNull();
    expect(v.favicon).toBe('https://example.com/favicon.ico');
  });

  it('rejects bodies that are not objects, and bad client names', () => {
    expect(err(null)).toMatch(/JSON object/);
    expect(err([])).toMatch(/JSON object/);
    expect(err({})).toMatch(/valid http/);
    expect(err({ url: 'https://example.com', client: '<script>' })).toMatch(/client/);
  });
});

describe('parseSourceTag (unknown tags)', () => {
  it('ignores tags from unknown platforms', () => {
    expect(parseSourceTag('myspace')).toEqual({ source: null, lists: [], capturedBy: null });
    expect(parseSourceTag('myspace:save')).toEqual({ source: null, lists: [], capturedBy: null });
  });
});
