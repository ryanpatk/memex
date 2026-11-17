import { describe, expect, it, vi } from 'vitest';
import { forgetLegacyLook, LEGACY_LOOK_KEY } from './legacyLook';

describe('the old look choice', () => {
  it('is removed once from storage', () => {
    const removeItem = vi.fn(() => Promise.resolve());
    forgetLegacyLook({ removeItem });
    expect(removeItem).toHaveBeenCalledTimes(1);
    expect(removeItem).toHaveBeenCalledWith('memex.look');
    expect(LEGACY_LOOK_KEY).toBe('memex.look');
  });

  it('ignores storage that fails, either way', async () => {
    expect(() => forgetLegacyLook({ removeItem: () => Promise.reject(new Error('locked')) })).not.toThrow();
    expect(() =>
      forgetLegacyLook({
        removeItem: () => {
          throw new Error('no storage');
        },
      }),
    ).not.toThrow();
    expect(() => forgetLegacyLook(undefined)).not.toThrow();
    // Let the rejected removal settle: it must not surface as an unhandled rejection.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});
