import { describe, expect, it } from 'vitest';
import { at, jot, link, space, task } from '../testing/fixtures';
import { buildEntries, toParts } from './feed';
import {
  continuesThought,
  groupJots,
  jotEdit,
  jotSnippet,
  planJotMoves,
  searchJots,
  undoMoves,
} from './jots';

const work = space('w', 'Work');
const home = space('h', 'Home');

const partsOf = (jots: ReturnType<typeof jot>[], extra: { tasks?: ReturnType<typeof task>[]; links?: ReturnType<typeof link>[] } = {}) =>
  toParts(
    buildEntries({
      jots,
      links: extra.links ?? [],
      notes: [],
      tasks: extra.tasks ?? [],
      spaces: [work, home],
      membership: { links: [], notes: [], tasks: [] },
    }),
  );

/** Each row as `kind`, `+kind` when it continues a thought, `kind…` when one continues it. */
const shape = (jots: ReturnType<typeof jot>[], extra = {}) =>
  groupJots(partsOf(jots, extra)).map(({ part, cont, held }) => `${cont ? '+' : ''}${part.kind}${held ? '…' : ''}`);

describe('groupJots (17B)', () => {
  it('stacks jots written within five minutes into one thought', () => {
    expect(shape([jot('a', { created_at: at(0) }), jot('b', { created_at: at(2) }), jot('c', { created_at: at(7) })])).toEqual([
      'day',
      'jot…',
      '+jot…',
      '+jot',
    ]);
  });

  it('starts a new thought after a longer pause', () => {
    expect(shape([jot('a', { created_at: at(0) }), jot('b', { created_at: at(6) })])).toEqual(['day', 'jot', 'jot']);
  });

  it('counts the five minutes from the jot before, inclusive', () => {
    expect(shape([jot('a', { created_at: at(0) }), jot('b', { created_at: at(5) })])).toEqual(['day', 'jot…', '+jot']);
  });

  it('never stacks across something else in the feed', () => {
    expect(
      shape([jot('a', { created_at: at(0) }), jot('b', { created_at: at(2) })], { tasks: [task('t', { created_at: at(1) })] }),
    ).toEqual(['day', 'jot', 'task', 'jot']);
  });

  it('keeps jots in different places apart', () => {
    expect(shape([jot('a', { created_at: at(0) }), jot('b', { created_at: at(1), profile_id: 'w' })])).toEqual(['day', 'jot', 'jot']);
    expect(
      shape([jot('a', { created_at: at(0), profile_id: 'w' }), jot('b', { created_at: at(1), profile_id: 'w' })]),
    ).toEqual(['day', 'jot…', '+jot']);
  });

  it('keeps an agent’s jots apart from yours, and agents from each other', () => {
    const grok = { captured_by: 'agent', captured_client: 'grok' };
    expect(shape([jot('a', { created_at: at(0) }), jot('b', { created_at: at(1), ...grok })])).toEqual(['day', 'jot', 'jot']);
    expect(
      shape([jot('a', { created_at: at(0), ...grok }), jot('b', { created_at: at(1), captured_by: 'agent', captured_client: 'claude' })]),
    ).toEqual(['day', 'jot', 'jot']);
    expect(shape([jot('a', { created_at: at(0), ...grok }), jot('b', { created_at: at(1), ...grok })])).toEqual(['day', 'jot…', '+jot']);
  });

  it('treats a missing author the same as an app write', () => {
    expect(shape([jot('a', { created_at: at(0), captured_by: null }), jot('b', { created_at: at(1) })])).toEqual(['day', 'jot…', '+jot']);
  });

  it('only continues jots', () => {
    const [day, first] = partsOf([jot('a', { created_at: at(0) })]);
    expect(continuesThought(undefined, first)).toBe(false);
    expect(continuesThought(day, first)).toBe(false);
  });

  it('takes a custom window', () => {
    const parts = partsOf([jot('a', { created_at: at(0) }), jot('b', { created_at: at(8) })]);
    expect(groupJots(parts, 10 * 60_000).map((r) => r.cont)).toEqual([false, false, true]);
  });
});

describe('jotEdit', () => {
  it('saves trimmed new text', () => {
    expect(jotEdit('first', '  second\nline  ')).toEqual({ kind: 'save', body: 'second\nline' });
  });

  it('does nothing when only whitespace changed', () => {
    expect(jotEdit('same', 'same  ')).toEqual({ kind: 'unchanged' });
    expect(jotEdit(' same', 'same')).toEqual({ kind: 'unchanged' });
  });

  it('refuses to empty a jot', () => {
    expect(jotEdit('something', '   \n ')).toEqual({ kind: 'empty' });
  });
});

describe('searchJots', () => {
  const jots = [
    jot('old', { body: 'Call the tile shop about zellige', created_at: at(0) }),
    jot('new', { body: 'Zellige samples arrived — the green one', created_at: at(10) }),
    jot('cafe', { body: 'Café near the station had great light', created_at: at(5) }),
    jot('temp-1', { body: 'zellige pending', created_at: at(20) }),
  ];

  it('finds every word in any order, newest first', () => {
    expect(searchJots(jots, 'zellige').map((j) => j.id)).toEqual(['new', 'old']);
    expect(searchJots(jots, 'green zellige').map((j) => j.id)).toEqual(['new']);
  });

  it('ignores case and accents', () => {
    expect(searchJots(jots, 'CAFE').map((j) => j.id)).toEqual(['cafe']);
  });

  it('needs at least two letters and skips pending jots', () => {
    expect(searchJots(jots, 'z')).toEqual([]);
    expect(searchJots(jots, '  ')).toEqual([]);
    expect(searchJots(jots, 'pending')).toEqual([]);
  });

  it('caps the results', () => {
    expect(searchJots(jots, 'the', 1).map((j) => j.id)).toEqual(['new']);
  });
});

describe('jotSnippet', () => {
  it('keeps short jots whole, on one line', () => {
    expect(jotSnippet('one\n two', 'two')).toBe('one two');
  });

  it('cuts around the first match', () => {
    const body = `${'a '.repeat(60)}needle ${'b '.repeat(60)}`;
    const snip = jotSnippet(body, 'needle', 40);
    expect(snip).toContain('needle');
    expect(snip.startsWith('…')).toBe(true);
    expect(snip.endsWith('…')).toBe(true);
    expect(snip.length).toBeLessThanOrEqual(42);
  });

  it('falls back to the start', () => {
    expect(jotSnippet('x'.repeat(100), 'missing', 20)).toBe(`${'x'.repeat(19)}…`);
  });
});

describe('planJotMoves', () => {
  const jots = [jot('a'), jot('b', { profile_id: 'w' }), jot('temp-9')];

  it('moves jots into a space, skipping ones already there', () => {
    expect(planJotMoves(jots, ['jot:a', 'jot:b', 'link:x'], 'w')).toEqual([{ id: 'a', from: null, to: 'w' }]);
  });

  it('moves a jot from one space to another', () => {
    expect(planJotMoves(jots, ['jot:b'], 'h')).toEqual([{ id: 'b', from: 'w', to: 'h' }]);
  });

  it('takes jots out of their space', () => {
    expect(planJotMoves(jots, ['jot:a', 'jot:b'], null)).toEqual([{ id: 'b', from: 'w', to: null }]);
  });

  it('skips pending, unknown and repeated keys', () => {
    expect(planJotMoves(jots, ['jot:temp-9', 'jot:nope', 'jot:a', 'jot:a'], 'h')).toEqual([{ id: 'a', from: null, to: 'h' }]);
  });

  it('reverses for Undo', () => {
    expect(undoMoves([{ id: 'b', from: 'w', to: 'h' }])).toEqual([{ id: 'b', from: 'h', to: 'w' }]);
  });
});
