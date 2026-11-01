import { describe, expect, it } from 'vitest';
import { at, jot, link, note, space, task } from '../testing/fixtures';
import type { LinkWithTag, NoteWithTags, SelfMessage, TaskWithTags } from '../types';
import { buildEntries, type Entry } from './feed';
import { createFiler, inboxOf } from './filer';

const work = space('w', 'Work');
const cooking = space('c', 'Cooking');
const code = space('k', 'Code');
const art = space('a', 'Art');
const ai = space('i', 'AI'); // too short to be matched by name
const spaces = [work, cooking, code, art, ai];

interface World {
  jots?: SelfMessage[];
  links?: LinkWithTag[];
  notes?: NoteWithTags[];
  tasks?: TaskWithTags[];
  /** item key (`link:id`) → space id */
  filed?: Record<string, string | string[]>;
}

const build = ({ jots = [], links = [], notes = [], tasks = [], filed = {} }: World) => {
  const rows = Object.entries(filed).flatMap(([key, ids]) =>
    (Array.isArray(ids) ? ids : [ids]).map((profile_id) => ({ key, profile_id })),
  );
  const of = (type: string) =>
    rows.filter((r) => r.key.startsWith(`${type}:`)).map((r) => ({ id: r.key.slice(type.length + 1), profile_id: r.profile_id }));
  const entries = buildEntries({
    jots,
    links,
    notes,
    tasks,
    spaces,
    membership: {
      links: of('link').map(({ id, profile_id }) => ({ link_id: id, profile_id })),
      notes: of('note').map(({ id, profile_id }) => ({ note_id: id, profile_id })),
      tasks: of('task').map(({ id, profile_id }) => ({ task_id: id, profile_id })),
    },
  });
  const filer = createFiler(entries, spaces);
  const byId = (id: string) => entries.find((e) => e.id === id) as Entry;
  return { entries, filer, suggest: (id: string) => filer.suggest(byId(id)) };
};

const DAY = 24 * 60;

describe('createFiler', () => {
  it('never suggests for jots or already-filed items', () => {
    const { suggest } = build({
      jots: [jot('j', { body: 'about Work' })],
      links: [link('l', { title: 'Work stuff' })],
      filed: { 'link:l': 'c' },
    });
    expect(suggest('jot:j')).toBeUndefined();
    expect(suggest('link:l')).toBeUndefined();
  });

  it('suggests nothing when no signal fires (unfiled is a finished state)', () => {
    const { suggest } = build({ links: [link('l', { title: 'Something unrelated' })] });
    expect(suggest('link:l')).toBeUndefined();
  });

  describe('a space named in the text', () => {
    it('is the strongest signal', () => {
      const { suggest } = build({ notes: [note('n', { title: 'Plan for work next week' })] });
      expect(suggest('note:n')).toEqual({ space: work, reason: 'Mentions “Work”' });
    });

    it('needs a whole-word match', () => {
      const { suggest } = build({ tasks: [task('t', { title: 'Party at the artisan market' })] });
      expect(suggest('task:t')).toBeUndefined();
    });

    it('ignores space names of two characters or fewer', () => {
      const { suggest } = build({ tasks: [task('t', { title: 'Read about AI' })] });
      expect(suggest('task:t')).toBeUndefined();
    });

    it('beats same-site votes', () => {
      const { suggest } = build({
        links: [
          link('a', { url: 'https://blog.dev/1', created_at: at(0) }),
          link('b', { url: 'https://blog.dev/2', created_at: at(DAY) }),
          link('new', { url: 'https://blog.dev/3', title: 'Cooking with code', created_at: at(5 * DAY) }),
        ],
        filed: { 'link:a': 'k', 'link:b': 'k' },
      });
      expect(suggest('link:new')?.space).toEqual(cooking);
    });
  });

  describe('same-site votes', () => {
    it('suggests where two or more links from the site went', () => {
      const { suggest } = build({
        links: [
          link('a', { url: 'https://www.blog.dev/1', created_at: at(0) }),
          link('b', { url: 'https://blog.dev/2', created_at: at(DAY) }),
          link('new', { url: 'https://blog.dev/3', created_at: at(5 * DAY) }),
        ],
        filed: { 'link:a': 'k', 'link:b': 'k' },
      });
      expect(suggest('link:new')).toEqual({ space: code, reason: '2 other links from blog.dev are in Code' });
    });

    it('needs at least two votes', () => {
      const { suggest } = build({
        links: [link('a', { url: 'https://blog.dev/1', created_at: at(0) }), link('new', { url: 'https://blog.dev/3', created_at: at(5 * DAY) })],
        filed: { 'link:a': 'k' },
      });
      expect(suggest('link:new')).toBeUndefined();
    });

    it('needs 60% agreement', () => {
      const { suggest } = build({
        links: [
          link('a', { url: 'https://blog.dev/1', created_at: at(0) }),
          link('b', { url: 'https://blog.dev/2', created_at: at(DAY) }),
          link('c', { url: 'https://blog.dev/3', created_at: at(2 * DAY) }),
          link('d', { url: 'https://blog.dev/4', created_at: at(3 * DAY) }),
          link('new', { url: 'https://blog.dev/5', created_at: at(9 * DAY) }),
        ],
        filed: { 'link:a': 'k', 'link:b': 'k', 'link:c': 'c', 'link:d': 'c' },
      });
      expect(suggest('link:new')).toBeUndefined();
    });

    it('ignores aggregator sites, where the host says nothing about the topic', () => {
      const { suggest } = build({
        links: [
          link('a', { url: 'https://github.com/a/b', created_at: at(0) }),
          link('b', { url: 'https://github.com/c/d', created_at: at(DAY) }),
          link('new', { url: 'https://github.com/e/f', created_at: at(5 * DAY) }),
        ],
        filed: { 'link:a': 'k', 'link:b': 'k' },
      });
      expect(suggest('link:new')).toBeUndefined();
    });
  });

  describe('saved in a burst', () => {
    it('suggests the space two nearby filed saves agree on', () => {
      const { suggest } = build({
        links: [
          link('a', { url: 'https://one.dev', created_at: at(0) }),
          link('b', { url: 'https://two.dev', created_at: at(10) }),
          link('new', { url: 'https://three.dev', created_at: at(15) }),
        ],
        filed: { 'link:a': 'c', 'link:b': 'c' },
      });
      expect(suggest('link:new')).toEqual({ space: cooking, reason: 'Saved alongside 2 things you put in Cooking' });
    });

    it('accepts a single neighbour within five minutes', () => {
      const { suggest } = build({
        links: [link('a', { url: 'https://one.dev', created_at: at(0) }), link('new', { url: 'https://three.dev', created_at: at(4) })],
        filed: { 'link:a': 'c' },
      });
      expect(suggest('link:new')).toEqual({ space: cooking, reason: 'Saved right after something in Cooking' });
    });

    it('says so when the neighbour is a jot written in the space', () => {
      const { suggest } = build({
        jots: [jot('j', { profile_id: 'c', body: 'dinner ideas', created_at: at(0) })],
        links: [link('new', { url: 'https://three.dev', created_at: at(3) })],
      });
      expect(suggest('link:new')).toEqual({ space: cooking, reason: 'You were writing in Cooking just then' });
    });

    it('ignores a single neighbour more than five minutes away', () => {
      const { suggest } = build({
        links: [link('a', { url: 'https://one.dev', created_at: at(0) }), link('new', { url: 'https://three.dev', created_at: at(10) })],
        filed: { 'link:a': 'c' },
      });
      expect(suggest('link:new')).toBeUndefined();
    });

    it('ignores filed saves more than twenty minutes away', () => {
      const { suggest } = build({
        links: [
          link('a', { url: 'https://one.dev', created_at: at(0) }),
          link('b', { url: 'https://two.dev', created_at: at(1) }),
          link('new', { url: 'https://three.dev', created_at: at(22) }),
        ],
        filed: { 'link:a': 'c', 'link:b': 'c' },
      });
      expect(suggest('link:new')).toBeUndefined();
    });

    it('stays quiet when neighbours disagree', () => {
      const { suggest } = build({
        links: [
          link('a', { url: 'https://one.dev', created_at: at(0) }),
          link('b', { url: 'https://two.dev', created_at: at(2) }),
          link('c', { url: 'https://four.dev', created_at: at(3) }),
          link('new', { url: 'https://three.dev', created_at: at(4) }),
        ],
        filed: { 'link:a': 'c', 'link:b': 'k', 'link:c': 'w' },
      });
      expect(suggest('link:new')).toBeUndefined();
    });

    it('counts neighbours before and after the save', () => {
      const { suggest } = build({
        notes: [
          note('before', { title: 'x', created_at: at(0) }),
          note('new', { title: 'y', created_at: at(10) }),
          note('after', { title: 'z', created_at: at(19) }),
        ],
        filed: { 'note:before': 'k', 'note:after': 'k' },
      });
      expect(suggest('note:new')?.space).toEqual(code);
    });
  });

  describe('similar title words', () => {
    const corpus: World = {
      notes: [
        note('c1', { title: 'Sourdough bread', created_at: at(0) }),
        note('c2', { title: 'Sourdough loaf bread', created_at: at(DAY) }),
        note('k1', { title: 'Typescript compiler', created_at: at(2 * DAY) }),
        note('k2', { title: 'Rust compiler internals', created_at: at(3 * DAY) }),
      ],
      filed: { 'note:c1': 'c', 'note:c2': 'c', 'note:k1': 'k', 'note:k2': 'k' },
    };

    it('suggests the space of the most similar filed items', () => {
      const { suggest } = build({
        ...corpus,
        notes: [...corpus.notes!, note('new', { title: 'Sourdough bread tips', created_at: at(10 * DAY) })],
      });
      expect(suggest('note:new')).toEqual({ space: cooking, reason: 'Similar to other things in Cooking' });
    });

    it('stays quiet when nothing is similar enough', () => {
      const { suggest } = build({
        ...corpus,
        notes: [...corpus.notes!, note('new', { title: 'Holiday packing list', created_at: at(10 * DAY) })],
      });
      expect(suggest('note:new')).toBeUndefined();
    });

    it('stays quiet for text made only of stop words and short words', () => {
      const { suggest } = build({
        ...corpus,
        notes: [...corpus.notes!, note('new', { title: 'how to do it', created_at: at(10 * DAY) })],
      });
      expect(suggest('note:new')).toBeUndefined();
    });
  });

  it('caches each answer', () => {
    const { filer, entries } = build({ notes: [note('n', { title: 'Work plan' })] });
    const entry = entries[0];
    expect(filer.suggest(entry)).toBe(filer.suggest(entry));
  });
});

describe('inboxOf', () => {
  const now = Date.parse(at(40 * DAY));

  it('lists recent unfiled items with a suggestion, newest first', () => {
    const { entries, filer } = build({
      jots: [jot('j', { body: 'Work thought', created_at: at(39 * DAY) })],
      notes: [
        note('old', { title: 'Work from long ago', created_at: at(5 * DAY) }),
        note('a', { title: 'Work plan', created_at: at(35 * DAY) }),
        note('b', { title: 'Cooking plan', created_at: at(36 * DAY) }),
        note('quiet', { title: 'nothing to see', created_at: at(37 * DAY) }),
        note('filed', { title: 'Work filed', created_at: at(38 * DAY) }),
      ],
      filed: { 'note:filed': 'w' },
    });
    const inbox = inboxOf(entries, filer, now);
    expect(inbox.map((x) => x.entry.id)).toEqual(['note:b', 'note:a']);
    expect(inbox.map((x) => x.suggestion.space)).toEqual([cooking, work]);
  });

  it('drops items older than 30 days', () => {
    const { entries, filer } = build({ notes: [note('n', { title: 'Work plan', created_at: at(10 * DAY - 1) })] });
    expect(inboxOf(entries, filer, now)).toEqual([]);
  });

  it('is empty when nothing waits', () => {
    const { entries, filer } = build({});
    expect(inboxOf(entries, filer, now)).toEqual([]);
  });
});
