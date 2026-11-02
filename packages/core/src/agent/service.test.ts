import { describe, expect, it } from 'vitest';
import { compareKeys, keyOf } from './keyset';
import { createMemoryAgentStore } from './memoryStore';
import { createAgentReadService } from './service';
import { AGENT_LIMITS } from './text';
import { AgentInputError, AgentNotFoundError, type AgentItemType, type AgentRecord } from './types';

const SPACE = '5aaaaaaa-0000-4000-8000-000000000001';
const OTHER_SPACE = '5aaaaaaa-0000-4000-8000-000000000002';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

let seq = 0;
const record = (type: AgentItemType, at: string, patch: Partial<AgentRecord> = {}): AgentRecord => ({
  type,
  id: uuid(++seq),
  created_at: at,
  updated_at: at,
  title: null,
  text: null,
  space_ids: [],
  tag_names: [],
  ...patch,
});

const T = (day: number, hour = 12) => `2026-10-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000000Z`;

function fixture() {
  seq = 0;
  const items: AgentRecord[] = [
    record('link', T(1), { title: 'Kyoto ryokan list', url: 'https://example.com/kyoto', text: 'Places to stay', space_ids: [SPACE], tag_names: ['travel'] }),
    record('link', T(2), { title: null, url: 'https://x.com/someone/status/123', source: 'x' }),
    record('note', T(2), { title: null, text: '# Kyoto plan\n\nDay one: **temples**.', space_ids: [SPACE] }),
    record('task', T(3), { title: 'Book Kyoto train', is_done: false, due_date: '2026-10-20', space_ids: [SPACE] }),
    record('jot', T(3), { text: 'kyoto feels right', space_ids: [SPACE] }),
    record('jot', T(4), { text: 'unrelated thought' }),
  ];
  return createMemoryAgentStore({
    items,
    spaces: [
      { id: SPACE, name: 'Kyoto trip', created_at: T(1, 0) },
      { id: OTHER_SPACE, name: 'Kitchen', created_at: T(1, 0) },
    ],
  });
}

describe('search', () => {
  it('matches every word across types, newest first, with space names and source', async () => {
    const service = createAgentReadService(fixture());
    const result = await service.search({ query: 'kyoto' });
    expect(result.items.map((i) => i.type)).toEqual(['jot', 'task', 'note', 'link']);
    const link = result.items.find((i) => i.type === 'link')!;
    expect(link).toMatchObject({ title: 'Kyoto ryokan list', source: 'web', spaces: [{ id: SPACE, name: 'Kyoto trip' }], tags: ['travel'] });
    const note = result.items.find((i) => i.type === 'note')!;
    expect(note.title).toBe('Kyoto plan');
    expect(note.excerpt).toBe('Kyoto plan Day one: temples.');
    expect(result.items.find((i) => i.type === 'jot')!.excerpt).toBeNull(); // one-line jot is all title
    expect(result.next_cursor).toBeNull();
    expect((await service.search({ query: 'kyoto train' })).items.map((i) => i.type)).toEqual(['task']);
  });

  it('filters by type, space, date and source', async () => {
    const service = createAgentReadService(fixture());
    expect((await service.search({ query: 'kyoto', types: ['note', 'jot'] })).items.map((i) => i.type)).toEqual(['jot', 'note']);
    expect((await service.search({ query: 'kyoto', space_id: SPACE })).items).toHaveLength(4);
    expect((await service.search({ query: 'kyoto', space_id: OTHER_SPACE })).items).toHaveLength(0);
    expect((await service.search({ query: 'kyoto', from: '2026-10-02', to: '2026-10-02' })).items.map((i) => i.type)).toEqual(['note']);
    const x = await service.search({ query: 'status', source: 'x' });
    expect(x.items.map((i) => [i.type, i.source, i.title])).toEqual([['link', 'x', 'x.com']]);
    // A source narrows to links even if other types were asked for.
    expect((await service.search({ query: 'kyoto', source: 'x', types: ['note'] })).items).toEqual([]);
  });

  it('refuses bad arguments with messages an agent can act on', async () => {
    const service = createAgentReadService(fixture());
    await expect(service.search({ query: '  ' })).rejects.toThrow(AgentInputError);
    await expect(service.search({ query: 'a', limit: 0 })).rejects.toThrow(/limit/);
    await expect(service.search({ query: 'a', cursor: 'bogus' })).rejects.toThrow(/cursor/);
    await expect(service.search({ query: 'a', space_id: 'nope' })).rejects.toThrow(/space_id/);
    await expect(service.search({ query: 'a', space_id: uuid(999) })).rejects.toThrow(AgentNotFoundError);
    await expect(service.search({ query: 'a', from: '2026-10-05', to: '2026-10-01' })).rejects.toThrow(/from/);
    await expect(service.search({ query: 'a', timezone: 'Nowhere/Land' })).rejects.toThrow(/timezone/);
    await expect(service.search({ query: 'a', types: ['user' as AgentItemType] })).rejects.toThrow(/types/);
  });

  it('caps the page size at the maximum', async () => {
    seq = 0;
    const items = Array.from({ length: 80 }, (_, i) => record('jot', T(1 + (i % 28), i % 24), { text: `match ${i}` }));
    const service = createAgentReadService(createMemoryAgentStore({ items }));
    const page = await service.search({ query: 'match', limit: 500 });
    expect(page.items).toHaveLength(AGENT_LIMITS.pageMax);
    expect(page.next_cursor).not.toBeNull();
  });
});

describe('pagination', () => {
  /** Many items across types, with deliberate timestamp ties between types and within one. */
  function busyStore() {
    seq = 0;
    const types: AgentItemType[] = ['link', 'note', 'task', 'jot'];
    const items: AgentRecord[] = [];
    for (let i = 0; i < 61; i++) {
      const type = types[i % 4];
      const at = T(1 + Math.floor(i / 6), 10); // six items share each instant
      items.push(record(type, at, { title: `alpha ${i}`, text: `alpha ${i}`, url: type === 'link' ? `https://e.com/${i}` : null }));
    }
    return { store: createMemoryAgentStore({ items }), items };
  }

  it('pages through everything exactly once, in order, across types and ties', async () => {
    for (const limit of [1, 4, 7, 50]) {
      const { store, items } = busyStore();
      const service = createAgentReadService(store);
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let guard = 0; guard < 100; guard++) {
        const page = await service.search({ query: 'alpha', limit, cursor });
        seen.push(...page.items.map((i) => `${i.type}:${i.id}`));
        if (!page.next_cursor) break;
        cursor = page.next_cursor;
      }
      const expected = [...items].sort((a, b) => compareKeys(keyOf(b), keyOf(a))).map((r) => `${r.type}:${r.id}`);
      expect(seen).toEqual(expected);
    }
  });

  it('pages a post-filtered source without skipping, even when matches are sparse', async () => {
    seq = 0;
    const items: AgentRecord[] = [];
    // 600 web links with one X link every 150: more than one scan window apart.
    for (let i = 0; i < 600; i++) {
      const isX = i % 150 === 0;
      items.push(
        record('link', `2026-10-01T00:00:00.${String(i).padStart(6, '0')}Z`, {
          title: `beta ${i}`,
          url: isX ? `https://x.com/a/status/${i + 1}` : `https://e.com/${i}`,
          source: isX ? 'x' : 'web',
        }),
      );
    }
    const service = createAgentReadService(createMemoryAgentStore({ items }));
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 50; guard++) {
      const page = await service.search({ query: 'beta', source: 'x', limit: 2, cursor });
      seen.push(...page.items.map((i) => i.title));
      if (!page.next_cursor) break;
      cursor = page.next_cursor;
    }
    expect(seen).toEqual(['beta 450', 'beta 300', 'beta 150', 'beta 0']);
  });
});

describe('get_item', () => {
  it('returns the full item with link metadata', async () => {
    const store = fixture();
    const service = createAgentReadService(store);
    const link = store.items[0];
    const detail = await service.getItem({ type: 'link', id: link.id });
    expect(detail).toMatchObject({ id: link.id, text: 'Places to stay', text_truncated: false, lists: [], captured_by: null });
  });

  it('caps long note bodies and says so', async () => {
    seq = 0;
    const body = 'word '.repeat(10_000);
    const note = record('note', T(1), { title: 'Long', text: body });
    const service = createAgentReadService(createMemoryAgentStore({ items: [note] }));
    const detail = await service.getItem({ type: 'note', id: note.id });
    expect(detail.text).toHaveLength(AGENT_LIMITS.fullTextChars);
    expect(detail).toMatchObject({ text_length: body.length, text_truncated: true });
  });

  it('answers not found for unknown ids and wrong types', async () => {
    const store = fixture();
    const service = createAgentReadService(store);
    await expect(service.getItem({ type: 'note', id: store.items[0].id })).rejects.toThrow(AgentNotFoundError);
    await expect(service.getItem({ type: 'note', id: 'x' })).rejects.toThrow(AgentInputError);
  });
});

describe('get_journal', () => {
  it('returns days oldest first in the given time zone', async () => {
    const service = createAgentReadService(fixture());
    const journal = await service.getJournal({ from: '2026-10-02', to: '2026-10-03' });
    expect(journal.days.map((d) => [d.date, d.items.map((i) => i.type)])).toEqual([
      ['2026-10-02', ['link', 'note']],
      ['2026-10-03', ['task', 'jot']],
    ]);
    // 12:00 UTC on Oct 2 is still Oct 2 in Tokyo (21:00); the range shifts with the zone.
    const tokyo = await service.getJournal({ from: '2026-10-02', timezone: 'Asia/Tokyo' });
    expect(tokyo.days.map((d) => d.date)).toEqual(['2026-10-02']);
    expect(tokyo.timezone).toBe('Asia/Tokyo');
  });

  it('limits the range and requires from', async () => {
    const service = createAgentReadService(fixture());
    await expect(service.getJournal({ from: '' })).rejects.toThrow(/from is required/);
    await expect(service.getJournal({ from: '2026-01-01', to: '2026-12-31' })).rejects.toThrow(/at most/);
  });
});

describe('spaces', () => {
  it('lists spaces with counts', async () => {
    const service = createAgentReadService(fixture());
    const { spaces } = await service.listSpaces();
    expect(spaces.map((s) => [s.name, s.total])).toEqual([
      ['Kitchen', 0],
      ['Kyoto trip', 4],
    ]);
    expect(spaces[1].counts).toEqual({ link: 1, note: 1, task: 1, jot: 1 });
  });

  it('gives a space overview with recent items, paged', async () => {
    const service = createAgentReadService(fixture());
    const overview = await service.spaceOverview({ space_id: SPACE, limit: 3 });
    expect(overview.space.name).toBe('Kyoto trip');
    expect(overview.total).toBe(4);
    expect(overview.recent.map((i) => i.type)).toEqual(['jot', 'task', 'note']);
    const more = await service.spaceOverview({ space_id: SPACE, limit: 3, cursor: overview.next_cursor! });
    expect(more.recent.map((i) => i.type)).toEqual(['link']);
    expect(more.next_cursor).toBeNull();
    await expect(service.spaceOverview({ space_id: uuid(999) })).rejects.toThrow(AgentNotFoundError);
  });
});

describe('timeline_stats', () => {
  it('counts by day, type, source and space', async () => {
    const service = createAgentReadService(fixture(), { now: () => new Date('2026-10-04T15:00:00Z') });
    const stats = await service.timelineStats({ from: '2026-10-01', to: '2026-10-04' });
    expect(stats.bucket).toBe('day');
    expect(stats.totals).toEqual({ link: 2, note: 1, task: 1, jot: 2, total: 6 });
    expect(stats.series.map((s) => [s.start, s.total])).toEqual([
      ['2026-10-01', 1],
      ['2026-10-02', 2],
      ['2026-10-03', 2],
      ['2026-10-04', 1],
    ]);
    expect(stats.links_by_source).toEqual({ x: 1, pinterest: 0, youtube: 0, web: 1 });
    expect(stats.by_space).toEqual([{ id: SPACE, name: 'Kyoto trip', count: 4 }]);
    expect(stats.truncated).toEqual([]);
  });

  it('defaults to the last 30 days and picks coarser buckets for long ranges', async () => {
    const service = createAgentReadService(fixture(), { now: () => new Date('2026-10-04T15:00:00Z') });
    const recent = await service.timelineStats({});
    expect([recent.from, recent.to, recent.series.length]).toEqual(['2026-09-05', '2026-10-04', 30]);
    const year = await service.timelineStats({ from: '2026-01-01', to: '2026-12-31' });
    expect(year.bucket).toBe('week');
    expect((await service.timelineStats({ from: '2025-01-01', to: '2026-12-31' })).bucket).toBe('month');
    await expect(service.timelineStats({ from: '2025-01-01', to: '2026-12-31', bucket: 'day' })).rejects.toThrow(/week/);
    await expect(service.timelineStats({ from: '2020-01-01', to: '2026-12-31' })).rejects.toThrow(/at most/);
  });
});

describe('getImages', () => {
  it('returns one item’s pictures, or a space’s newest items with pictures, as URLs', async () => {
    const store = fixture();
    store.items.push(
      record('link', T(5), { title: 'Moss garden', url: 'https://example.com/moss', preview_image_url: 'https://img.example/moss.jpg', space_ids: [SPACE] }),
      record('note', T(6), { title: 'Mood', text: 'Look: ![temple](https://img.example/t.jpg) and ![](data:image/png;base64,AAAA)', space_ids: [SPACE] }),
      record('link', T(7), { title: 'Inline svg', url: 'https://example.com/svg', preview_image_url: 'data:image/svg+xml;utf8,<svg/>', space_ids: [SPACE] }),
    );
    const service = createAgentReadService(store);
    const space = await service.getImages({ space_id: SPACE });
    expect(space.items.map((i) => [i.item.title, i.images.map((img) => [img.kind, img.url])])).toEqual([
      ['Mood', [['embedded', 'https://img.example/t.jpg']]],
      ['Moss garden', [['preview', 'https://img.example/moss.jpg']]],
    ]);
    const one = await service.getImages({ type: 'note', id: space.items[0].item.id });
    expect(one.items[0].images[0]).toEqual({ url: 'https://img.example/t.jpg', alt: 'temple', kind: 'embedded' });
    await expect(service.getImages({})).rejects.toThrow(/either/);
    await expect(service.getImages({ type: 'note', id: uuid(1), space_id: SPACE })).rejects.toThrow(/either/);
    await expect(service.getImages({ type: 'note', id: uuid(999) })).rejects.toThrow(AgentNotFoundError);
    await expect(service.getImages({ space_id: OTHER_SPACE.replace('2', '7') })).rejects.toThrow(AgentNotFoundError);
  });
});
