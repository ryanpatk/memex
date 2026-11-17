import { describe, expect, it } from 'vitest';
import { visibleSpacePills } from './spacePills';

const spaces = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}` }));

describe('visibleSpacePills', () => {
  it('shows every space when there are few', () => {
    expect(visibleSpacePills(spaces.slice(0, 7), null).more).toEqual([]);
  });
  it('folds the rest into More past six', () => {
    const { shown, more } = visibleSpacePills(spaces, null);
    expect(shown.map((s) => s.id)).toEqual(['s0', 's1', 's2', 's3', 's4', 's5']);
    expect(more.map((s) => s.id)).toEqual(['s6', 's7', 's8']);
  });
  it('keeps the chosen space on the row even when it is further down', () => {
    const { shown, more } = visibleSpacePills(spaces, 's8');
    expect(shown.map((s) => s.id)).toContain('s8');
    expect(more.map((s) => s.id)).not.toContain('s8');
  });
});
