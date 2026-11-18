import { describe, expect, it } from 'vitest';
import { fitPillCount, orderSpaces, spaceRow } from './spaceOrder';
import { buildSpaceColors } from './tokens/spaceColors';
import { movePin, pinPositionUpdates } from './pins';
import { spacePositions } from './spaceOrder';
import type { Profile } from './types';

const space = (id: string, created: number, extra: Partial<Profile> = {}): Profile => ({
  id,
  user_id: 'u',
  name: id,
  created_at: `2026-11-${String(created).padStart(2, '0')}T00:00:00Z`,
  updated_at: '2026-11-01T00:00:00Z',
  ...extra,
});

const ids = (list: { id: string }[]) => list.map((s) => s.id);

describe('orderSpaces', () => {
  it('puts numbered spaces first, then the rest by creation date', () => {
    const spaces = [space('new', 9), space('b', 2, { position: 2 }), space('old', 1), space('a', 5, { position: 1 })];
    expect(ids(orderSpaces(spaces))).toEqual(['a', 'b', 'old', 'new']);
  });

  it('is creation order when nothing is numbered (today’s order)', () => {
    expect(ids(orderSpaces([space('c', 3), space('a', 1), space('b', 2)]))).toEqual(['a', 'b', 'c']);
  });

  it('moves write only what changed, and colours don’t follow the order', () => {
    const spaces = [space('a', 1, { position: 1 }), space('b', 2, { position: 2 }), space('c', 3, { position: 3 })];
    const before = buildSpaceColors(spaces, ['red', 'blue', 'gold']);
    const order = movePin(ids(spaces), 2, 0);
    const updates = pinPositionUpdates(order, spacePositions(spaces));
    expect(updates).toEqual([
      { id: 'c', position: 1 },
      { id: 'a', position: 2 },
      { id: 'b', position: 3 },
    ]);
    const moved = spaces.map((s) => ({ ...s, position: updates.find((u) => u.id === s.id)!.position }));
    expect(ids(orderSpaces(moved))).toEqual(['c', 'a', 'b']);
    expect(buildSpaceColors(moved, ['red', 'blue', 'gold'])).toEqual(before);
  });
});

describe('fitPillCount', () => {
  it('fits everything when it all fits', () => {
    expect(fitPillCount([100, 100, 100], 320, 10, 80)).toBe(3);
  });

  it('keeps room for More when some don’t fit', () => {
    // 100 + 10 + 100 = 210; a third would need 320 + 10 + 80 (More)
    expect(fitPillCount([100, 100, 100, 100], 320, 10, 80)).toBe(2);
  });

  it('shows none when not even one fits beside More, so More is never clipped', () => {
    expect(fitPillCount([500, 100], 200, 10, 80)).toBe(0);
    expect(fitPillCount([100, 100], 150, 10, 80)).toBe(0);
    expect(fitPillCount([], 200, 10, 80)).toBe(0);
  });
});

describe('spaceRow', () => {
  const spaces = [space('a', 1), space('b', 2, { hidden: true }), space('c', 3), space('d', 4), space('e', 5)];

  it('leaves hidden spaces out of the row and puts them after the overflow in More', () => {
    const { shown, more } = spaceRow(spaces, 2, null);
    expect(ids(shown)).toEqual(['a', 'c']);
    expect(ids(more)).toEqual(['d', 'e', 'b']);
  });

  it('gives the chosen space the last place when it doesn’t fit, even a hidden one', () => {
    expect(ids(spaceRow(spaces, 2, 'e').shown)).toEqual(['a', 'e']);
    expect(ids(spaceRow(spaces, 2, 'b').shown)).toEqual(['a', 'b']);
    expect(ids(spaceRow(spaces, 2, 'b').more)).toEqual(['c', 'd', 'e']);
  });

  it('shows everything visible when it all fits', () => {
    expect(ids(spaceRow(spaces, 10, null).shown)).toEqual(['a', 'c', 'd', 'e']);
  });
});
