import { describe, expect, it } from 'vitest';
import { buildDemoData } from '../data/fixtures/demoData';
import { toJournal } from '../data/journal';
import { destination, linkSource, payloadFromIntent, payloadFromParams, recentSpaces, sharedFrom, shareResult } from './shareModel';

const NOW = new Date(2026, 10, 1, 12, 0);
const journal = toJournal(buildDemoData(NOW), '#5077ff', NOW);
const space = (name: string) => journal.spaces.find((s) => s.name === name)!;

describe('what arrived', () => {
  it('reads expo-share-intent’s fields: Safari’s URL and page title', () => {
    const payload = payloadFromIntent({ text: 'https://calmtech.com', webUrl: 'https://calmtech.com', meta: { title: 'Calm Technology' } });
    expect(sharedFrom(payload)).toEqual({ kind: 'link', url: 'https://calmtech.com', title: 'Calm Technology', note: null });
  });

  it('reads memex://share?… params', () => {
    expect(payloadFromParams({ url: 'https://x.com/a/status/1', title: ['T', 'ignored'] })).toEqual({ url: 'https://x.com/a/status/1', text: null, title: 'T' });
  });

  it('names the platform for a link’s chip', () => {
    expect(linkSource('https://x.com/rauchg/status/1850000000000000000')).toBe('X');
    expect(linkSource('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('YouTube');
    expect(linkSource('https://calmtech.com')).toBeNull();
  });
});

describe('recentSpaces', () => {
  it('puts the spaces with the latest activity first, then the rest in order', () => {
    const ordered = recentSpaces(journal.spaces, journal.entries);
    expect(ordered).toHaveLength(journal.spaces.length);
    const lastAt = (id: string) => journal.entries.filter((e) => e.spaces.some((s) => s.id === id)).at(-1)?.at ?? '';
    const times = ordered.map((s) => lastAt(s.id));
    expect([...times].sort().reverse()).toEqual(times);
  });
});

describe('shareResult', () => {
  const link = { kind: 'link' as const, url: 'https://calmtech.com', title: 'Calm Technology', note: null };

  it('a link: the note (minus its @spaces) is why you saved it, marked as a share', () => {
    expect(shareResult(link, 'For the reading pile @Reading', journal.spaces, null)).toEqual({
      kind: 'link',
      url: 'https://calmtech.com',
      title: 'Calm Technology',
      note: 'For the reading pile',
      capturedBy: 'share',
      spaces: [{ id: space('Reading').id, name: 'Reading' }],
    });
    expect(shareResult(link, '  ', journal.spaces, null)).toMatchObject({ note: null, spaces: [] });
  });

  it('the picked space comes first, @spaces after, once each', () => {
    const kyoto = space('Kyoto trip');
    const result = shareResult(link, '@Reading @Kyoto trip', journal.spaces, kyoto);
    expect(result?.spaces.map((s) => s.name)).toEqual(['Kyoto trip', 'Reading']);
  });

  it('text follows the composer: a jot, a task, a lone URL as a link, a note when asked', () => {
    const text = { kind: 'text' as const, text: '' };
    expect(shareResult(text, 'Buy matcha in Uji', journal.spaces, space('Kyoto trip'))).toEqual({
      kind: 'jot',
      body: 'Buy matcha in Uji',
      spaces: [{ id: space('Kyoto trip').id, name: 'Kyoto trip' }],
    });
    expect(shareResult(text, '[] Book the ryokan', journal.spaces, null)).toMatchObject({ kind: 'task', title: 'Book the ryokan' });
    expect(shareResult(text, 'https://calmtech.com', journal.spaces, null)).toMatchObject({ kind: 'link', capturedBy: 'share' });
    expect(shareResult(text, 'Title\nBody', journal.spaces, null, true)).toMatchObject({ kind: 'note', title: 'Title' });
    expect(shareResult(text, '   ', journal.spaces, null)).toBeNull();
    expect(shareResult({ kind: 'empty' }, 'x', journal.spaces, null)).toBeNull();
  });

  it('says where it’ll land', () => {
    expect(destination(null)).toBe('Nothing to save yet');
    expect(destination(shareResult(link, '', journal.spaces, null))).toBe('In your Journal');
    expect(destination(shareResult(link, '@Reading', journal.spaces, space('Kyoto trip')))).toBe('In your Journal, filed in Kyoto trip, Reading');
    expect(destination(shareResult({ kind: 'text', text: '' }, 'tea', journal.spaces, space('Kyoto trip')))).toBe('In Kyoto trip');
  });
});
