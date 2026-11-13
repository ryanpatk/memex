import { describe, expect, it } from 'vitest';
import { createDemoData } from './demoData';
import { bulkCountFor, withBulkItems } from './bulkData';
import { createMemoryRepository } from './repository';

describe('bulk fixture data', () => {
  it('reads the fixture mode', () => {
    expect(bulkCountFor('large')).toBe(2400);
    expect(bulkCountFor('large:5000')).toBe(5000);
    expect(bulkCountFor('1')).toBe(0);
    expect(bulkCountFor(undefined)).toBe(0);
  });

  it('adds the requested number of items, the same every time', () => {
    const now = Date.parse('2026-11-12T12:00:00Z');
    const base = createDemoData(now);
    const a = withBulkItems(base, 1200, now);
    const b = withBulkItems(base, 1200, now);
    expect(a.links.length + a.notes.length - base.links.length - base.notes.length).toBe(1200);
    expect(a.links.map((l) => l.title)).toEqual(b.links.map((l) => l.title));
    expect(new Set(a.links.map((l) => l.id)).size).toBe(a.links.length);
  });

  it('works through the memory repository', async () => {
    const repo = createMemoryRepository(withBulkItems(createDemoData(), 300));
    expect((await repo.links.getAll()).length).toBeGreaterThan(250);
  });
});
