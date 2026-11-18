import { describe, expect, it } from 'vitest';
import {
  globalPins,
  movePin,
  nextPinPosition,
  pinLabel,
  pinPositionUpdates,
  pinShortcutIndex,
  pinsFor,
  spacePins,
} from './pins';
import type { LinkWithTag } from './types';

const link = (id: string, extra: Partial<LinkWithTag> = {}): LinkWithTag =>
  ({
    id,
    project_id: 'p',
    user_id: 'u',
    url: `https://${id}.example.com/`,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    ...extra,
  }) as LinkWithTag;

const ids = (links: LinkWithTag[]) => links.map((l) => l.id);

describe('globalPins', () => {
  it('puts numbered pins first, lowest first, then the rest by name', () => {
    const links = [
      link('zeta', { title: 'Zeta', is_super_favorite: true }),
      link('mail', { title: 'Mail', is_super_favorite: true, pin_position: 2 }),
      link('cal', { title: 'Calendar', is_super_favorite: true, pin_position: 1 }),
      link('alpha', { title: 'alpha', is_super_favorite: true, pin_position: null }),
      link('plain', { title: 'Not pinned', pin_position: 3 }),
    ];
    expect(ids(globalPins(links))).toEqual(['cal', 'mail', 'alpha', 'zeta']);
  });

  it('sorts by URL when there is no title, and leaves out unsaved rows', () => {
    const links = [
      link('b', { url: 'https://b.dev', is_super_favorite: true }),
      link('a', { title: '  ', url: 'https://a.dev', is_super_favorite: true }),
      link('temp-1', { title: 'Saving', is_super_favorite: true }),
    ];
    expect(ids(globalPins(links))).toEqual(['a', 'b']);
  });
});

describe('spacePins', () => {
  const links = [link('one', { title: 'One' }), link('two', { title: 'Two', is_super_favorite: true }), link('three', { title: 'Three' })];
  const membership = [
    { profile_id: 's', link_id: 'one', is_super_favorite: true, pin_position: 2 },
    { profile_id: 's', link_id: 'three', is_super_favorite: true, pin_position: 1 },
    { profile_id: 's', link_id: 'two', is_super_favorite: false },
    { profile_id: 'other', link_id: 'two', is_super_favorite: true, pin_position: 1 },
  ];

  it('orders the space’s own pins by their place in that space', () => {
    expect(ids(spacePins(links, membership, 's'))).toEqual(['three', 'one']);
    expect(ids(spacePins(links, membership, 'other'))).toEqual(['two']);
  });

  it('pinsFor picks the space’s pins inside a space and the global ones outside', () => {
    expect(ids(pinsFor(links, membership, 's'))).toEqual(['three', 'one']);
    expect(ids(pinsFor(links, membership, null))).toEqual(['two']);
  });
});

describe('placing and moving pins', () => {
  it('a new pin goes after every numbered one', () => {
    expect(nextPinPosition([])).toBe(1);
    expect(nextPinPosition([3, null, 1, undefined])).toBe(4);
  });

  it('movePin moves one id and clamps the target', () => {
    expect(movePin(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(movePin(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(movePin(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a']);
    expect(movePin(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });

  it('writes only the pins whose number changes', () => {
    const current = new Map([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 4],
    ]);
    expect(pinPositionUpdates(['a', 'c', 'b', 'd'], current)).toEqual([
      { id: 'c', position: 2 },
      { id: 'b', position: 3 },
    ]);
  });

  it('numbers pins that had no place yet', () => {
    const current = new Map<string, number | null>([
      ['a', null],
      ['b', null],
    ]);
    expect(pinPositionUpdates(['b', 'a'], current)).toEqual([
      { id: 'b', position: 1 },
      { id: 'a', position: 2 },
    ]);
  });
});

describe('pinLabel', () => {
  it('keeps the site name before a tagline, else the host', () => {
    expect(pinLabel(link('x', { title: 'Calm Technology | principles' }))).toBe('Calm Technology');
    expect(pinLabel(link('x', { title: 'Local-first software: you own your data' }))).toBe('Local-first software');
    expect(pinLabel(link('x', { title: 'Inbox (3) - Mail' }))).toBe('Inbox (3)');
    expect(pinLabel(link('x', { url: 'https://www.japan-guide.com/e/1.html' }))).toBe('japan-guide.com');
  });
});

describe('pinShortcutIndex', () => {
  const key = (code: string, mods: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) => ({
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    code,
    ...mods,
  });

  it('maps ⌥1…⌥9 by the physical key', () => {
    expect(pinShortcutIndex(key('Digit1'))).toBe(0);
    expect(pinShortcutIndex(key('Digit9'))).toBe(8);
    expect(pinShortcutIndex(key('Numpad3'))).toBe(2);
  });

  it('ignores other keys and other modifiers', () => {
    expect(pinShortcutIndex(key('Digit0'))).toBeNull();
    expect(pinShortcutIndex(key('KeyA'))).toBeNull();
    expect(pinShortcutIndex(key('Digit1', { altKey: false }))).toBeNull();
    expect(pinShortcutIndex(key('Digit1', { metaKey: true }))).toBeNull();
    expect(pinShortcutIndex(key('Digit1', { shiftKey: true }))).toBeNull();
  });
});
