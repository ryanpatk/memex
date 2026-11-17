import { describe, expect, it } from 'vitest';
import { spaceHoldsAll, spacesHoldingAny, tileAction } from './spaceFiling';

const membership: Record<string, string[]> = {
  'link:1': ['kitchen', 'reading'],
  'note:2': ['kitchen'],
  'task:3': [],
};
const spacesOf = (key: string) => membership[key] ?? [];

describe('move sheet filing', () => {
  it('ticks a space only when it holds every card', () => {
    expect(spaceHoldsAll(['link:1', 'note:2'], spacesOf, 'kitchen')).toBe(true);
    expect(spaceHoldsAll(['link:1', 'note:2'], spacesOf, 'reading')).toBe(false);
    expect(spaceHoldsAll([], spacesOf, 'kitchen')).toBe(false);
  });

  it('adds to a space that is missing any card, takes out of one that has them all', () => {
    expect(tileAction(['link:1', 'task:3'], spacesOf, 'kitchen')).toBe('add');
    expect(tileAction(['note:2'], spacesOf, 'kitchen')).toBe('remove');
    expect(tileAction([], spacesOf, 'kitchen')).toBe('none');
  });

  it('lists each space holding any card once', () => {
    expect(spacesHoldingAny(['link:1', 'note:2', 'task:3'], spacesOf).sort()).toEqual(['kitchen', 'reading']);
    expect(spacesHoldingAny(['task:3'], spacesOf)).toEqual([]);
  });
});
