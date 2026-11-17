import { describe, expect, it } from 'vitest';
import { alpha, mix } from './palette';

describe('mix / alpha', () => {
  it('mixes in sRGB and appends alpha', () => {
    expect(mix('#ffffff', '#000000', 0.5)).toBe('#808080');
    expect(mix('#ff0000', '#0000ff', 1)).toBe('#ff0000');
    expect(alpha('#123456', 0.5)).toBe('#12345680');
    expect(alpha('#123456ff', 0)).toBe('#12345600');
  });
});
