import { describe, expect, it } from 'vitest';
import { RETIRED_STORAGE_KEYS, forgetRetiredSettings } from './retiredSettings';

const memoryStorage = (entries: Record<string, string>) => {
  const map = new Map(Object.entries(entries));
  return { map, removeItem: (key: string) => void map.delete(key) };
};

describe('forgetRetiredSettings', () => {
  it('removes the classic look switch and the other classic-only keys', () => {
    const storage = memoryStorage({
      'memex.look': 'classic',
      'memex.link-captions': 'inset',
      'memex.self-notes-open': '1',
      'memex.library.hadPinned': '1',
      'memex.cards-font': 'plex',
      'memex.sound': 'off',
    });
    forgetRetiredSettings(storage);
    expect([...storage.map.keys()].sort()).toEqual(['memex.cards-font', 'memex.sound']);
  });

  it('includes the look key', () => {
    expect(RETIRED_STORAGE_KEYS).toContain('memex.look');
  });

  it('survives storage that throws or is missing', () => {
    expect(() =>
      forgetRetiredSettings({
        removeItem: () => {
          throw new Error('blocked');
        },
      }),
    ).not.toThrow();
    expect(() => forgetRetiredSettings(null)).not.toThrow();
  });
});
