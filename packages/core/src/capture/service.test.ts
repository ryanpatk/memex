import { describe, expect, it, vi } from 'vitest';
import { parseCaptureInput, type CaptureInput } from './input';
import { createMemoryCaptureStore } from './memoryStore';
import { CaptureConflictError, CaptureError, createCaptureService, linkMatchFor, pickMatch, type CapturedLink } from './service';

const SPACE = '6f1c2a4e-1d2b-4c3d-8e9f-0a1b2c3d4e5f';
const OTHER_SPACE = '7f1c2a4e-1d2b-4c3d-8e9f-0a1b2c3d4e5f';
const TAG = 'a0b1c2d3-e4f5-4677-8899-aabbccddeeff';

const input = (body: Record<string, unknown>): CaptureInput => {
  const r = parseCaptureInput(body, { defaultCapturedBy: 'api', allowedCapturedBy: ['extension', 'api'] });
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

/** A row saved before 2026-11-01: no source id, no url key. */
const legacy = (id: string, url: string, created_at = '2026-01-01T00:00:00Z', source: string | null = null): CapturedLink => ({
  id,
  url,
  title: 'old',
  description: null,
  favicon_url: null,
  preview_image_url: null,
  source,
  source_id: null,
  lists: [],
  captured_by: null,
  captured_client: null,
  url_key: null,
  created_at,
});

let clock = 0;
const tick = () => new Date(Date.UTC(2026, 10, 1, 12, 0, clock++)).toISOString();

describe('capture', () => {
  it('saves a new link with provenance, then returns it for the same item in another shape', async () => {
    const store = createMemoryCaptureStore({}, tick);
    const service = createCaptureService(store);

    const first = await service.capture(input({ url: 'https://x.com/jack/status/20', source: 'x', sourceId: '20', list: 'bookmarked', capturedBy: 'extension', client: 'memex-extension/0.3.0' }));
    expect(first.duplicate).toBe(false);
    expect(first.link).toMatchObject({
      url: 'https://x.com/jack/status/20',
      source: 'x',
      source_id: '20',
      lists: ['bookmarked'],
      captured_by: 'extension',
      captured_client: 'memex-extension/0.3.0',
      url_key: 'x.com/jack/status/20',
    });

    const again = await service.capture(input({ url: 'https://twitter.com/i/web/status/20?s=20' }));
    expect(again.duplicate).toBe(true);
    expect(again.link.id).toBe(first.link.id);
    expect(store.links).toHaveLength(1);
  });

  it('dedupes YouTube videos across watch, youtu.be and shorts URLs', async () => {
    const store = createMemoryCaptureStore({}, tick);
    const service = createCaptureService(store);
    const a = await service.capture(input({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s', list: 'liked' }));
    const b = await service.capture(input({ url: 'https://youtu.be/dQw4w9WgXcQ?si=abc' }));
    const c = await service.capture(input({ url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ' }));
    expect([b.duplicate, c.duplicate]).toEqual([true, true]);
    expect(new Set([a.link.id, b.link.id, c.link.id]).size).toBe(1);
    expect(a.link.preview_image_url).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  });

  it('finds links saved before source ids existed', async () => {
    const store = createMemoryCaptureStore({
      links: [
        legacy('old-x', 'https://twitter.com/jack/status/20'),
        legacy('old-pin', 'https://www.pinterest.com/pin/123/', '2026-01-01T00:00:00Z', 'pinterest:save'),
        legacy('old-web', 'http://www.example.com/a/'),
      ],
    });
    const service = createCaptureService(store);
    expect((await service.capture(input({ url: 'https://x.com/jack/status/20' }))).link.id).toBe('old-x');
    expect((await service.capture(input({ url: 'https://uk.pinterest.co.uk/pin/123' }))).link.id).toBe('old-pin');
    expect((await service.capture(input({ url: 'https://example.com/a' }))).link.id).toBe('old-web');
    expect(store.links).toHaveLength(3);
  });

  it('falls back to the normalized URL, ignoring tracking parameters', async () => {
    const store = createMemoryCaptureStore({}, tick);
    const service = createCaptureService(store);
    const a = await service.capture(input({ url: 'https://example.com/post?id=1&utm_source=x' }));
    const b = await service.capture(input({ url: 'https://www.example.com/post/?fbclid=abc&id=1' }));
    const c = await service.capture(input({ url: 'https://example.com/post?id=2' }));
    expect(b.duplicate).toBe(true);
    expect(b.link.id).toBe(a.link.id);
    expect(c.duplicate).toBe(false);
  });

  it('never matches a longer id or a different item', async () => {
    const store = createMemoryCaptureStore({ links: [legacy('x-12', 'https://x.com/a/status/12'), legacy('web', 'https://example.com/a--55')] });
    const service = createCaptureService(store);
    expect((await service.capture(input({ url: 'https://x.com/a/status/1' }))).duplicate).toBe(false);
    expect((await service.capture(input({ url: 'https://www.pinterest.com/pin/55/' }))).duplicate).toBe(false);
  });

  it('merges a new list into an existing link', async () => {
    const store = createMemoryCaptureStore({}, tick);
    const service = createCaptureService(store);
    await service.capture(input({ url: 'https://x.com/a/status/1', capturedBy: 'extension' }));
    const r = await service.capture(input({ url: 'https://x.com/a/status/1', list: 'bookmarked' }));
    expect(r).toMatchObject({ duplicate: true, listsAdded: ['bookmarked'] });
    expect(store.links[0].lists).toEqual(['bookmarked']);
    const again = await service.capture(input({ url: 'https://x.com/a/status/1', list: 'bookmarked' }));
    expect(again.listsAdded).toEqual([]);
  });

  it('returns the winner when a concurrent capture hits the unique index', async () => {
    const store = createMemoryCaptureStore({}, tick);
    const service = createCaptureService(store);
    // Both captures look before either inserts.
    const find = store.findCandidates.bind(store);
    let calls = 0;
    store.findCandidates = async (m) => (calls++ < 2 ? [] : find(m));
    const [a, b] = await Promise.all([
      service.capture(input({ url: 'https://x.com/a/status/9' })),
      service.capture(input({ url: 'https://x.com/a/status/9' })),
    ]);
    expect(store.links).toHaveLength(1);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    expect(a.link.id).toBe(b.link.id);
  });

  it('rethrows other insert errors', async () => {
    const store = createMemoryCaptureStore();
    store.insertLink = async () => {
      throw new Error('db down');
    };
    await expect(createCaptureService(store).capture(input({ url: 'https://example.com' }))).rejects.toThrow('db down');
    expect(new CaptureConflictError()).toBeInstanceOf(Error);
  });

  it('fills gaps from enrich, but client metadata wins', async () => {
    const enrich = vi.fn(async () => ({ title: 'Scraped', description: 'Scraped desc', image: 'https://img.example/a.jpg', favicon: 'javascript:x' }));
    const store = createMemoryCaptureStore();
    const service = createCaptureService(store, { enrich });
    const r = await service.capture(input({ url: 'https://example.com', title: 'Mine' }));
    expect(r.link).toMatchObject({ title: 'Mine', description: 'Scraped desc', preview_image_url: 'https://img.example/a.jpg', favicon_url: null });

    enrich.mockClear();
    await service.capture(input({ url: 'https://example.com/full', title: 't', description: 'd', image: 'https://img.example/b.jpg' }));
    expect(enrich).not.toHaveBeenCalled();
  });

  it('treats a failing scraper as no metadata', async () => {
    const service = createCaptureService(createMemoryCaptureStore(), { enrich: async () => Promise.reject(new Error('timeout')) });
    const r = await service.capture(input({ url: 'https://example.com' }));
    expect(r.link.title).toBeNull();
  });

  it('files into an owned space and tags, on new and duplicate captures', async () => {
    const store = createMemoryCaptureStore({ spaces: [SPACE], tags: [TAG] }, tick);
    const service = createCaptureService(store);
    const a = await service.capture(input({ url: 'https://example.com', spaceId: SPACE, tagIds: [TAG] }));
    expect(a.attached).toEqual({ space: SPACE, tags: [TAG] });
    const b = await service.capture(input({ url: 'https://example.com/', spaceId: SPACE }));
    expect(b.duplicate).toBe(true);
    expect(store.memberships).toHaveLength(1);
    expect(store.linkTags).toHaveLength(1);
  });

  it('refuses spaces and tags the user does not own, before writing anything', async () => {
    const store = createMemoryCaptureStore({ spaces: [SPACE] });
    const service = createCaptureService(store);
    await expect(service.capture(input({ url: 'https://example.com', spaceId: OTHER_SPACE }))).rejects.toMatchObject({ status: 404, message: 'Space not found' });
    await expect(service.capture(input({ url: 'https://example.com', tagIds: [TAG] }))).rejects.toBeInstanceOf(CaptureError);
    expect(store.links).toHaveLength(0);
  });
});

describe('lookup', () => {
  it('is read-only and uses the same matching as capture', async () => {
    const store = createMemoryCaptureStore({ links: [legacy('old', 'https://x.com/a/status/5')] });
    const service = createCaptureService(store);
    expect(await service.lookup('https://twitter.com/i/web/status/5')).toMatchObject({ found: true, link: { id: 'old' } });
    expect(await service.lookup('https://example.com/nothing')).toEqual({ found: false });
    expect(store.links).toHaveLength(1);
    await expect(service.lookup('javascript:alert(1)')).rejects.toBeInstanceOf(CaptureError);
  });
});

describe('addToSpace and remove', () => {
  it('checks UUIDs and ownership', async () => {
    const store = createMemoryCaptureStore({ links: [legacy('00000000-0000-4000-8000-000000000001', 'https://example.com')], spaces: [SPACE] });
    const service = createCaptureService(store);
    const id = '00000000-0000-4000-8000-000000000001';
    expect(await service.addToSpace(id, SPACE.toUpperCase())).toEqual({ linkId: id, spaceId: SPACE });
    expect(await service.addToSpace(id, SPACE)).toEqual({ linkId: id, spaceId: SPACE });
    expect(store.memberships).toHaveLength(1);
    await expect(service.addToSpace('nope', SPACE)).rejects.toMatchObject({ status: 400 });
    await expect(service.addToSpace(id, OTHER_SPACE)).rejects.toMatchObject({ status: 404 });
    await expect(service.addToSpace('00000000-0000-4000-8000-000000000009', SPACE)).rejects.toMatchObject({ message: 'Link not found' });

    expect(await service.remove('00000000-0000-4000-8000-000000000009')).toBe(false);
    expect(await service.remove(id)).toBe(true);
    await expect(service.remove('1 or 1=1')).rejects.toBeInstanceOf(CaptureError);
  });
});

describe('pickMatch', () => {
  it('prefers a source-id match, then the oldest', () => {
    const match = linkMatchFor('https://x.com/a/status/7');
    const byUrl = legacy('by-url', 'https://twitter.com/a/status/7', '2025-01-01T00:00:00Z');
    const byId = { ...legacy('by-id', 'https://x.com/i/web/status/7', '2026-06-01T00:00:00Z'), source: 'x', source_id: '7' };
    expect(pickMatch([byUrl, byId], match)?.id).toBe('by-id');
    expect(pickMatch([legacy('b', 'https://example.com', '2026-02-01T00:00:00Z'), legacy('a', 'https://example.com/', '2026-01-01T00:00:00Z')], linkMatchFor('https://example.com'))?.id).toBe('a');
    expect(pickMatch([legacy('other', 'https://example.org')], linkMatchFor('https://example.com'))).toBeNull();
  });
});
