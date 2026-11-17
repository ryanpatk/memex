import { describe, expect, it } from 'vitest';
import { entryLabel, hideFromInbox } from './entryLabel';

const kitchen = { id: 'k', name: 'Kitchen reno', color: '#ff5a6f' };
const kyoto = { id: 'y', name: 'Kyoto trip', color: '#00b8f0' };

describe('entryLabel', () => {
  it('is Unfiled with no spaces', () => {
    expect(entryLabel([])).toEqual({ name: null, color: null, extra: 0 });
  });

  it('names the first space and counts the rest', () => {
    expect(entryLabel([kitchen, kyoto])).toEqual({ name: 'Kitchen reno', color: '#ff5a6f', extra: 1 });
  });

  it('leads with the page’s space when the entry is in it', () => {
    expect(entryLabel([kitchen, kyoto], 'y')).toEqual({ name: 'Kyoto trip', color: '#00b8f0', extra: 1 });
    expect(entryLabel([kitchen], 'y').name).toBe('Kitchen reno');
  });
});

describe('hideFromInbox', () => {
  it('adds a key without touching the original set', () => {
    const before = new Set(['a']);
    const after = hideFromInbox(before, 'b');
    expect([...after]).toEqual(['a', 'b']);
    expect([...before]).toEqual(['a']);
  });
});
