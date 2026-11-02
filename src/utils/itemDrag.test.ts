import { describe, expect, it } from 'vitest';
import { dragAttrs, dragGhostLabel, isFileableKey, parseDragKeys, resolveDragKeys } from './itemDrag';

describe('isFileableKey', () => {
  it('accepts links, notes, tasks and jots', () => {
    expect(isFileableKey('jot:abc')).toBe(true);
    expect(isFileableKey('link:abc')).toBe(true);
    expect(isFileableKey('note:abc')).toBe(true);
    expect(isFileableKey('task:abc')).toBe(true);
  });

  it('refuses runs, optimistic rows and junk', () => {
    expect(isFileableKey('jot:temp-1')).toBe(false);
    expect(isFileableKey('run:abc')).toBe(false);
    expect(isFileableKey('link:temp-123')).toBe(false);
    expect(isFileableKey('link:')).toBe(false);
    expect(isFileableKey('')).toBe(false);
  });
});

describe('resolveDragKeys', () => {
  const selection = { active: true, keys: ['link:a', 'note:b', 'task:temp-1', 'task:c'] };

  it('drags the whole selection when the dragged item is in it', () => {
    expect(resolveDragKeys(['note:b'], selection)).toEqual(['link:a', 'note:b', 'task:c']);
  });

  it('drags only the item when it is not selected', () => {
    expect(resolveDragKeys(['link:z'], selection)).toEqual(['link:z']);
  });

  it('ignores the selection when selection mode is off', () => {
    expect(resolveDragKeys(['note:b'], { ...selection, active: false })).toEqual(['note:b']);
  });

  it('keeps a gallery’s own keys, deduped and fileable only', () => {
    expect(resolveDragKeys(['link:a', 'link:a', 'run:x', 'link:b'], selection)).toEqual(['link:a', 'link:b']);
  });

  it('is empty for things that can’t be filed', () => {
    expect(resolveDragKeys(['jot:temp-1'], selection)).toEqual([]);
    expect(resolveDragKeys(['run:x'], selection)).toEqual([]);
  });
});

describe('parseDragKeys', () => {
  it('reads a JSON array of keys', () => {
    expect(parseDragKeys('["link:a","task:b","link:a"]')).toEqual(['link:a', 'task:b']);
  });

  it('drops anything that isn’t a fileable key', () => {
    expect(parseDragKeys('["link:a", 3, "run:x", "jot:temp-1", null]')).toEqual(['link:a']);
  });

  it('is empty for missing or malformed data', () => {
    expect(parseDragKeys('')).toEqual([]);
    expect(parseDragKeys(null)).toEqual([]);
    expect(parseDragKeys('{"keys":[]}')).toEqual([]);
    expect(parseDragKeys('not json')).toEqual([]);
  });
});

describe('dragGhostLabel', () => {
  it('names one item and counts several', () => {
    expect(dragGhostLabel(['link:a'], '  Tile   samples ')).toBe('Tile samples');
    expect(dragGhostLabel(['link:a', 'note:b'], 'ignored')).toBe('2 items');
    expect(dragGhostLabel(['link:a'], '')).toBe('1 item');
  });

  it('shortens long titles', () => {
    const label = dragGhostLabel(['link:a'], 'x'.repeat(100));
    expect(label).toHaveLength(61);
    expect(label.endsWith('…')).toBe(true);
  });
});

describe('dragAttrs', () => {
  it('marks fileable items draggable with their title', () => {
    expect(dragAttrs('task:a', 'Buy milk')).toEqual({ draggable: true, 'data-drag-label': 'Buy milk' });
  });

  it('leaves optimistic rows alone', () => {
    expect(dragAttrs('jot:a', 'hi')).toEqual({ draggable: true, 'data-drag-label': 'hi' });
    expect(dragAttrs('jot:temp-1', 'hi')).toEqual({});
    expect(dragAttrs('task:temp-1', 'hi')).toEqual({});
  });
});
