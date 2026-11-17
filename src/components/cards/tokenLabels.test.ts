import { describe, expect, it } from 'vitest';
import { usedLabel } from './tokenLabels';

describe('usedLabel', () => {
  it('says when a token was last used', () => {
    expect(usedLabel('2026-11-16T10:00:00Z', () => '2 hours ago')).toBe('used 2 hours ago');
  });
  it('says never for a token that was never used', () => {
    expect(usedLabel(null, () => 'unused')).toBe('never used');
  });
});
