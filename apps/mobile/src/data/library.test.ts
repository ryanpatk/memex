import { describe, expect, it } from 'vitest';
import { buildDemoData } from './fixtures/demoData';
import { libraryItems, pictureRatio, sourceTabs } from './library';

const NOW = new Date(2026, 10, 1, 12, 0);
const links = buildDemoData(NOW).links;

describe('the phone Library', () => {
  it('shows every link, newest saved first', () => {
    const items = libraryItems(links, { source: null, search: '' });
    expect(items).toHaveLength(links.length);
    const saved = items.map((i) => i.link.created_at);
    expect([...saved].sort().reverse()).toEqual(saved);
  });

  it('filters by source with core’s rules (legacy tags and hosts count)', () => {
    const ids = (source: 'pinterest' | 'youtube' | 'web') => libraryItems(links, { source, search: '' }).map((i) => i.id).sort();
    expect(ids('pinterest')).toEqual(['o1', 'o12', 'o4', 'o7', 'o9', 'p0', 'p1', 'p2', 'p3', 'p4']);
    expect(ids('youtube')).toEqual(['o11', 'o2', 'o6', 'y1']);
    expect(ids('web')).toEqual(['l1', 'l2', 'l3', 'o10', 'o5']);
  });

  it('searches titles, descriptions and URLs, within a source too', () => {
    expect(libraryItems(links, { source: null, search: 'attention' }).map((i) => i.id)).toEqual(['l2']);
    expect(libraryItems(links, { source: 'pinterest', search: 'GLAZE' }).map((i) => i.id)).toEqual(['p1']);
    expect(libraryItems(links, { source: 'x', search: 'glaze' })).toEqual([]);
  });

  it('leaves optimistic rows out', () => {
    const temp = { ...links[0], id: 'temp-1' };
    expect(libraryItems([...links, temp], { source: null, search: '' })).toHaveLength(links.length);
  });

  it('lists the sources present with counts', () => {
    expect(sourceTabs(links)).toEqual([
      { key: null, label: 'All', count: 24 },
      { key: 'x', label: 'X', count: 5 },
      { key: 'pinterest', label: 'Pinterest', count: 10 },
      { key: 'youtube', label: 'YouTube', count: 4 },
      { key: 'web', label: 'Web', count: 5 },
    ]);
  });

  it('shapes cards by platform', () => {
    const byId = new Map(links.map((l) => [l.id, l]));
    expect(pictureRatio(byId.get('p0')!)).toBeCloseTo(4 / 3);
    expect(pictureRatio(byId.get('y1')!)).toBeCloseTo(9 / 16);
    expect(pictureRatio(byId.get('l1')!)).toBeNull();
  });
});
