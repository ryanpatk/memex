import { describe, expect, it } from 'vitest';
import { PASTEL_SKY_COLORS } from '@memex/core';
import { alpha, buildPalette, mix } from './palette';

const HEX = /^#[0-9a-f]{6}$/;

describe('buildPalette', () => {
  it.each([false, true])('gives every role a plain hex colour (dark=%s)', (dark) => {
    const palette = buildPalette(dark);
    for (const [role, value] of Object.entries(palette)) {
      if (role === 'dark') continue;
      expect(value, role).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
    }
  });

  it('keeps Pastel Sky ink and neutrals from core', () => {
    expect(buildPalette(false).ink).toBe(PASTEL_SKY_COLORS.light.neutral10);
    expect(buildPalette(true).ink).toBe(PASTEL_SKY_COLORS.dark.neutral10);
  });

  it('keys the accent to the canvas swatch', () => {
    expect(buildPalette(false, 'coral').accent).not.toBe(buildPalette(false, 'blue').accent);
    expect(buildPalette(false, 'blue').accent).toMatch(HEX);
  });
});

describe('mix / alpha', () => {
  it('mixes in sRGB and appends alpha', () => {
    expect(mix('#ffffff', '#000000', 0.5)).toBe('#808080');
    expect(mix('#ff0000', '#0000ff', 1)).toBe('#ff0000');
    expect(alpha('#123456', 0.5)).toBe('#12345680');
    expect(alpha('#123456ff', 0)).toBe('#12345600');
  });
});
