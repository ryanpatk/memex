import { describe, expect, it, vi } from 'vitest';
import { createDismissals, DISMISSALS_KEY, parseDismissals, type DismissalStorage } from './dismissals';

const NOW = new Date(2026, 10, 1, 12, 0);
const DAY = 86_400_000;

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  const storage: DismissalStorage = {
    getItem: vi.fn(async (key: string) => data.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => void data.set(key, value)),
  };
  return { storage, data };
};

describe('parseDismissals', () => {
  it('keeps recent dismissals and forgets old or malformed ones', () => {
    const recent = new Date(NOW.getTime() - 10 * DAY).toISOString();
    const old = new Date(NOW.getTime() - 100 * DAY).toISOString();
    expect(parseDismissals(JSON.stringify({ 'link:a': recent, 'link:b': old, 'link:c': 7 }), NOW)).toEqual({ 'link:a': recent });
    expect(parseDismissals('not json', NOW)).toEqual({});
    expect(parseDismissals('[1,2]', NOW)).toEqual({});
    expect(parseDismissals(null, NOW)).toEqual({});
  });

  it('caps the list at the newest 500', () => {
    const many = Object.fromEntries(Array.from({ length: 520 }, (_, i) => [`link:${i}`, new Date(NOW.getTime() - i * 60_000).toISOString()]));
    const kept = parseDismissals(JSON.stringify(many), NOW);
    expect(Object.keys(kept)).toHaveLength(500);
    expect(kept['link:0']).toBeDefined();
    expect(kept['link:519']).toBeUndefined();
  });
});

describe('createDismissals', () => {
  it('dismisses and restores, telling subscribers and storing the set', async () => {
    const { storage, data } = memoryStorage();
    const dismissals = createDismissals({ storage, now: () => NOW });
    await dismissals.load();
    const listener = vi.fn();
    dismissals.subscribe(listener);
    const before = dismissals.current();
    dismissals.dismiss('link:a');
    expect(dismissals.current()).not.toBe(before);
    expect([...dismissals.current()]).toEqual(['link:a']);
    expect(JSON.parse(data.get(DISMISSALS_KEY)!)).toEqual({ 'link:a': NOW.toISOString() });
    dismissals.dismiss('link:a');
    expect(listener).toHaveBeenCalledTimes(1);
    dismissals.restore('link:a');
    expect(dismissals.current().size).toBe(0);
    expect(JSON.parse(data.get(DISMISSALS_KEY)!)).toEqual({});
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('loads what an earlier session stored, keeping anything dismissed meanwhile', async () => {
    const { storage, data } = memoryStorage({ [DISMISSALS_KEY]: JSON.stringify({ 'link:old': NOW.toISOString() }) });
    const dismissals = createDismissals({ storage, now: () => NOW });
    dismissals.dismiss('note:new');
    expect(storage.setItem).not.toHaveBeenCalled();
    await dismissals.load();
    expect([...dismissals.current()].sort()).toEqual(['link:old', 'note:new']);
    expect(Object.keys(JSON.parse(data.get(DISMISSALS_KEY)!)).sort()).toEqual(['link:old', 'note:new']);
  });

  it('works without storage (tests, demo data) and survives storage errors', async () => {
    const memoryOnly = createDismissals();
    memoryOnly.dismiss('task:x');
    await memoryOnly.load();
    expect(memoryOnly.current().has('task:x')).toBe(true);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = createDismissals({
      storage: { getItem: () => Promise.reject(new Error('disk')), setItem: () => Promise.reject(new Error('disk')) },
    });
    broken.dismiss('task:y');
    await broken.load();
    expect(broken.current().has('task:y')).toBe(true);
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(2));
    warn.mockRestore();
  });
});
