import { describe, expect, it } from 'vitest';
import { at, jot, link, note, profile, space, task } from '../testing/fixtures';
import {
  buildEntries,
  dayLabel,
  entriesInSpace,
  entryText,
  isVisualLink,
  toJournalSpaces,
  toParts,
  type Entry,
  type Part,
} from './feed';

const work = space('w', 'Work');
const home = space('h', 'Home');
const noMembership = { links: [], notes: [], tasks: [] };

/** Local-time ISO string, so day boundaries don't depend on the test machine's zone. */
const local = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

const xLink = (id: string, when: string, over = {}) =>
  link(id, { url: `https://x.com/u/status/${id}`, source: 'x:bookmark', created_at: when, ...over });
const webLink = (id: string, when: string) => link(id, { url: `https://example.com/${id}`, created_at: when });

const linkEntries = (links: ReturnType<typeof link>[]): Entry[] =>
  buildEntries({ jots: [], links, notes: [], tasks: [], spaces: [], membership: noMembership });

const kinds = (parts: Part[]) => parts.map((p) => (p.kind === 'run' ? `run(${p.entries.length})` : p.kind));

describe('buildEntries', () => {
  it('merges every kind into one list, oldest first', () => {
    const entries = buildEntries({
      jots: [jot('j1', { created_at: at(30) })],
      links: [link('l1', { created_at: at(10) })],
      notes: [note('n1', { created_at: at(20) })],
      tasks: [task('t1', { created_at: at(0) })],
      spaces: [],
      membership: noMembership,
    });
    expect(entries.map((e) => e.id)).toEqual(['task:t1', 'link:l1', 'note:n1', 'jot:j1']);
    expect(entries.map((e) => e.at)).toEqual([at(0), at(10), at(20), at(30)]);
  });

  it('resolves space membership per item and ignores rows for unknown spaces', () => {
    const entries = buildEntries({
      jots: [],
      links: [link('l1')],
      notes: [note('n1')],
      tasks: [task('t1')],
      spaces: [work, home],
      membership: {
        links: [
          { link_id: 'l1', profile_id: 'w' },
          { link_id: 'l1', profile_id: 'h' },
          { link_id: 'l1', profile_id: 'deleted-space' },
        ],
        notes: [{ note_id: 'n1', profile_id: 'h' }],
        tasks: [],
      },
    });
    const byId = new Map(entries.map((e) => [e.id, e]));
    expect(byId.get('link:l1')?.spaces).toEqual([work, home]);
    expect(byId.get('note:n1')?.spaces).toEqual([home]);
    expect(byId.get('task:t1')?.spaces).toEqual([]);
  });

  it('puts a jot in the space it was written in, or none for Home', () => {
    const entries = buildEntries({
      jots: [jot('a', { profile_id: 'w' }), jot('b', { profile_id: null }), jot('c', { profile_id: 'gone' })],
      links: [],
      notes: [],
      tasks: [],
      spaces: [work],
      membership: noMembership,
    });
    expect(entries.map((e) => e.spaces)).toEqual([[work], [], []]);
  });

  it('tags each link with its source', () => {
    const [entry] = linkEntries([xLink('1', at(0))]);
    expect(entry.kind === 'link' && entry.source.key).toBe('x');
  });
});

describe('entriesInSpace', () => {
  it('keeps entries filed in the space', () => {
    const entries = buildEntries({
      jots: [jot('j', { profile_id: 'w' })],
      links: [link('a'), link('b')],
      notes: [],
      tasks: [],
      spaces: [work],
      membership: { links: [{ link_id: 'a', profile_id: 'w' }], notes: [], tasks: [] },
    });
    expect(entriesInSpace(entries, 'w').map((e) => e.id).sort()).toEqual(['jot:j', 'link:a']);
    expect(entriesInSpace(entries, 'other')).toEqual([]);
  });
});

describe('entryText', () => {
  it('reads the text each kind is known by', () => {
    const [j, l, n, t] = buildEntries({
      jots: [jot('j', { body: 'a jot', created_at: at(0) })],
      links: [link('l', { title: 'Title', description: 'Desc', created_at: at(1) })],
      notes: [note('n', { title: 'Note', body: '**bold** [label](https://x.y)', created_at: at(2) })],
      tasks: [task('t', { title: 'Do it', created_at: at(3) })],
      spaces: [],
      membership: noMembership,
    });
    expect(entryText(j)).toBe('a jot');
    expect(entryText(l)).toBe('Title Desc');
    expect(entryText(n)).toBe('Note bold label');
    expect(entryText(t)).toBe('Do it');
  });

  it('tolerates missing link and note titles', () => {
    const [l] = linkEntries([link('l')]);
    expect(entryText(l)).toBe(' ');
  });
});

describe('toJournalSpaces', () => {
  it('orders spaces by creation and attaches colours, falling back to the accent', () => {
    const spaces = toJournalSpaces(
      [profile('b', 'Second', at(10)), profile('a', 'First', at(0))],
      new Map([['a', '#f00']]),
    );
    expect(spaces).toEqual([
      { id: 'a', name: 'First', color: '#f00' },
      { id: 'b', name: 'Second', color: 'var(--color-1)' },
    ]);
  });

  it('accepts a fallback colour for clients without CSS variables', () => {
    expect(toJournalSpaces([profile('a', 'A')], new Map(), '#888')[0].color).toBe('#888');
  });
});

describe('dayLabel', () => {
  const now = new Date(2026, 9, 25, 15, 0); // Sun 25 Oct 2026, local

  it('names today and yesterday', () => {
    expect(dayLabel(local(2026, 10, 25, 0, 1), now)).toBe('Today');
    expect(dayLabel(local(2026, 10, 24, 23, 59), now)).toBe('Yesterday');
  });

  it('uses weekday and date within the year', () => {
    const date = new Date(2026, 9, 20, 12);
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date);
    const day = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
    expect(dayLabel(date.toISOString(), now)).toBe(`${weekday}, ${day}`);
  });

  it('adds the year for other years', () => {
    const date = new Date(2025, 11, 31, 12);
    const expected = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
    expect(dayLabel(date.toISOString(), now)).toBe(expected);
  });

  it('handles yesterday across a month boundary', () => {
    expect(dayLabel(local(2026, 10, 31, 9), new Date(2026, 10, 1, 9))).toBe('Yesterday');
  });
});

describe('toParts', () => {
  const now = new Date(2026, 9, 25, 18);

  it('is empty for no entries', () => {
    expect(toParts([], now)).toEqual([]);
  });

  it('starts each new day with a separator', () => {
    const parts = toParts(
      linkEntries([webLink('a', local(2026, 10, 24, 9)), webLink('b', local(2026, 10, 25, 9)), webLink('c', local(2026, 10, 25, 10))]),
      now,
    );
    expect(kinds(parts)).toEqual(['day', 'link', 'day', 'link', 'link']);
    const days = parts.filter((p): p is Extract<Part, { kind: 'day' }> => p.kind === 'day');
    expect(days.map((d) => d.label)).toEqual(['Yesterday', 'Today']);
    expect(days[0].id).toBe(`day:${new Date(local(2026, 10, 24, 9)).toDateString()}`);
  });

  it('folds back-to-back saves from one platform into a run', () => {
    const parts = toParts(
      linkEntries([xLink('1', local(2026, 10, 25, 9)), xLink('2', local(2026, 10, 25, 9, 1)), xLink('3', local(2026, 10, 25, 9, 2))]),
      now,
    );
    expect(kinds(parts)).toEqual(['day', 'run(3)']);
    const run = parts[1];
    expect(run.kind === 'run' && run.id).toBe('run:link:1');
    expect(run.kind === 'run' && run.at).toBe(local(2026, 10, 25, 9));
    expect(run.kind === 'run' && run.source.key).toBe('x');
  });

  it('folds new-style captures (platform in source) with older tagged ones', () => {
    const parts = toParts(
      linkEntries([
        xLink('1', local(2026, 10, 25, 9)),
        xLink('2', local(2026, 10, 25, 9, 1), { source: 'x', source_id: '2', lists: ['bookmarked'], captured_by: 'extension' }),
        link('3', { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', source: 'youtube', created_at: local(2026, 10, 25, 9, 2), preview_image_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg' }),
        link('4', { url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', source: 'youtube', created_at: local(2026, 10, 25, 9, 3) }),
      ]),
      now,
    );
    expect(kinds(parts)).toEqual(['day', 'run(2)', 'run(2)']);
    const yt = parts[2];
    expect(yt.kind === 'run' && `${yt.source.label} ${yt.source.many}`).toBe('YouTube videos');
  });

  it('leaves a single platform save as a plain entry', () => {
    expect(kinds(toParts(linkEntries([xLink('1', local(2026, 10, 25, 9))]), now))).toEqual(['day', 'link']);
  });

  it('never folds plain web links', () => {
    const parts = toParts(linkEntries([webLink('a', local(2026, 10, 25, 9)), webLink('b', local(2026, 10, 25, 9, 1))]), now);
    expect(kinds(parts)).toEqual(['day', 'link', 'link']);
  });

  it('breaks a run when another platform or kind comes between', () => {
    const pin = (id: string, when: string) => link(id, { url: `https://pinterest.com/pin/${id}`, created_at: when });
    const parts = toParts(
      buildEntries({
        jots: [jot('j', { created_at: local(2026, 10, 25, 9, 3) })],
        links: [
          xLink('1', local(2026, 10, 25, 9)),
          xLink('2', local(2026, 10, 25, 9, 1)),
          pin('p', local(2026, 10, 25, 9, 2)),
          xLink('3', local(2026, 10, 25, 9, 4)),
          xLink('4', local(2026, 10, 25, 9, 5)),
        ],
        notes: [],
        tasks: [],
        spaces: [],
        membership: noMembership,
      }),
      now,
    );
    expect(kinds(parts)).toEqual(['day', 'run(2)', 'link', 'jot', 'run(2)']);
  });

  it('does not continue a run across midnight', () => {
    const parts = toParts(linkEntries([xLink('1', local(2026, 10, 24, 23, 59)), xLink('2', local(2026, 10, 25, 0, 1))]), now);
    expect(kinds(parts)).toEqual(['day', 'link', 'day', 'link']);
  });
});

describe('isVisualLink', () => {
  const only = (l: ReturnType<typeof link>) => linkEntries([l])[0] as Extract<Entry, { kind: 'link' }>;

  it('is true for a platform save with a picture', () => {
    expect(isVisualLink(only(xLink('1', at(0), { preview_image_url: 'https://img/1.jpg' })))).toBe(true);
  });

  it('is false for a platform save without a picture', () => {
    expect(isVisualLink(only(xLink('1', at(0))))).toBe(false);
  });

  it('is false for a web link even with a picture', () => {
    expect(isVisualLink(only(link('w', { preview_image_url: 'https://img/w.jpg' })))).toBe(false);
  });
});
