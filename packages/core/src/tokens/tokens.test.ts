import { describe, expect, it } from 'vitest';
import { profile } from '../testing/fixtures';
import { CANVAS_COLOR_OPTIONS, DEFAULT_CANVAS_COLOR_ID, getCanvasColorOption, isCanvasColorId } from './canvasColors';
import { buildCanvasGradient, buildThemeSurfaceColors, formatOklch, getCanvasGradientStops, parseOklch } from './color';
import { buildSpaceColors } from './spaceColors';

describe('canvas swatches', () => {
  it('falls back to the default swatch for unknown ids (old swatch names)', () => {
    expect(getCanvasColorOption('lilac').id).toBe(DEFAULT_CANVAS_COLOR_ID);
    expect(isCanvasColorId('lilac')).toBe(false);
    expect(isCanvasColorId('blue')).toBe(true);
  });
});

describe('OKLCH maths', () => {
  it('parses with or without alpha', () => {
    expect(parseOklch('oklch(0.5 0.1 200)')).toEqual({ l: 0.5, c: 0.1, h: 200 });
    expect(parseOklch('oklch(0.5 0.1 200 / 0.4)')).toEqual({ l: 0.5, c: 0.1, h: 200 });
    expect(parseOklch('#fff')).toBeNull();
  });

  it('clamps when formatting', () => {
    expect(formatOklch(1.2, 0.5, 10)).toBe('oklch(1.000 0.400 10.000)');
    expect(formatOklch(-1, -1, 10)).toBe('oklch(0.000 0.000 10.000)');
  });

  it('lightens the gradient top and keeps the base', () => {
    expect(getCanvasGradientStops('oklch(0.9 0.02 268)')).toEqual({ top: 'oklch(0.942 0.020 268.000)', base: 'oklch(0.9 0.02 268)' });
    expect(buildCanvasGradient('oklch(0.9 0.02 268)', true)).toBe(
      'linear-gradient(180deg, oklch(0.938 0.020 268.000) 0%, oklch(0.9 0.02 268) 95%, oklch(0.9 0.02 268) 100%)',
    );
  });

  it('falls back to neutral surfaces for an unparseable base', () => {
    expect(buildThemeSurfaceColors('red').activeBg).toBe('oklch(0.56 0.052 264)');
    expect(buildThemeSurfaceColors('red', true).activeBg).toBe('oklch(0.96 0.018 264)');
  });

  it('keys light-mode fills to the swatch source colour, with readable labels', () => {
    const gold = getCanvasColorOption('gold');
    const blue = getCanvasColorOption('blue');
    const onGold = buildThemeSurfaceColors(gold.light, false, gold.source);
    const onBlue = buildThemeSurfaceColors(blue.light, false, blue.source);
    expect(parseOklch(onGold.activeBg)?.h).toBe(95);
    expect(parseOklch(onGold.activeFg)!.l).toBeLessThan(0.5); // dark ink on a bright fill
    expect(parseOklch(onBlue.activeFg)!.l).toBeGreaterThan(0.9); // white on a deep fill
  });

  it('derives a surface set for every swatch in both modes', () => {
    for (const option of CANVAS_COLOR_OPTIONS) {
      for (const dark of [false, true]) {
        const surfaces = buildThemeSurfaceColors(dark ? option.dark : option.light, dark, option.source);
        Object.values(surfaces).forEach((value) => expect(value).toMatch(/^oklch\(/));
      }
    }
  });
});

describe('buildSpaceColors', () => {
  it('assigns hued swatches in creation order and wraps', () => {
    const hued = CANVAS_COLOR_OPTIONS.filter((o) => o.source).map((o) => o.source);
    const spaces = Array.from({ length: hued.length + 1 }, (_, i) =>
      profile(`s${i}`, `S${i}`, new Date(Date.UTC(2026, 0, 1 + i)).toISOString()),
    );
    const colors = buildSpaceColors([...spaces].reverse());
    expect(colors.get('s0')).toBe(hued[0]);
    expect(colors.get('s1')).toBe(hued[1]);
    expect(colors.get(`s${hued.length}`)).toBe(hued[0]);
  });

  it('is empty without spaces', () => {
    expect(buildSpaceColors(undefined).size).toBe(0);
  });
});
