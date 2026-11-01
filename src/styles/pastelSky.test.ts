import { describe, expect, it } from 'vitest';
import {
  MOTION,
  PASTEL_SKY_COLORS,
  RADIUS,
  SPACE,
  TYPE_SCALE,
  FONT_WEIGHTS,
  DEPTH,
  type PastelSkyColors,
} from '@memex/core';
import css from './pastel-sky.css?raw';
import componentsCss from './components.css?raw';
import { WORDMARK_INK } from '@memex/core';

/*
 * @memex/core's Pastel Sky constants are a copy of this CSS for clients that
 * can't read CSS variables. This test keeps the copy honest: change a token
 * in pastel-sky.css and it fails until tokens/pastelSky.ts matches.
 */

const block = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf('\n}', start));
};
const vars = (text: string) =>
  Object.fromEntries([...text.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

const light = vars(block(':root'));
const dark = { ...light, ...vars(block("[data-theme='dark']")) };

const colorVars = (k: keyof PastelSkyColors) =>
  k === 'accentText' ? 'cte-accent-text' : k.replace(/^(color|neutral)(\d+)$/, '$1-$2');

const px = (v: string) => Number(v.replace(/px$/, ''));
const em = (v: string) => Number(v.replace(/em$/, ''));

describe('Pastel Sky tokens match pastel-sky.css', () => {
  it.each(['light', 'dark'] as const)('%s colours', (mode) => {
    const source = mode === 'light' ? light : dark;
    for (const [key, value] of Object.entries(PASTEL_SKY_COLORS[mode])) {
      expect([key, value]).toEqual([key, source[colorVars(key as keyof PastelSkyColors)]]);
    }
  });

  it('type scale', () => {
    for (const [size, role] of Object.entries(TYPE_SCALE)) {
      expect([size, role]).toEqual([
        size,
        { size: px(light[`size-${size}`]), line: px(light[`line-${size}`]), letterSpacing: em(light[`letter-spacing-${size}`]) },
      ]);
    }
  });

  it('spacing and radius', () => {
    for (const [k, v] of Object.entries(SPACE)) expect([k, v]).toEqual([k, px(light[`space-${k}`])]);
    for (const [k, v] of Object.entries(RADIUS)) expect([k, v]).toEqual([k, px(light[`radius-${k}`])]);
  });

  it('weights, motion and depth', () => {
    expect(FONT_WEIGHTS).toEqual({
      regular: Number(light['weight-ui-regular']),
      medium: Number(light['weight-ui-medium']),
      heavy: Number(light['weight-ui-heavy']),
    });
    expect(MOTION).toEqual({
      duration: Number(light['motion-duration'].replace('ms', '')),
      largeDuration: Number(light['motion-large-duration'].replace('ms', '')),
      pressDistance: px(light['motion-press-distance']),
      popupScale: Number(light['motion-popup-scale']),
    });
    expect(DEPTH).toEqual({
      hoverSwell: Number(light['hover-swell']),
      hoverSwellIcon: Number(light['hover-swell-icon']),
      hoverLift: px(light['hover-lift']),
      pressSettle: Number(light['press-settle']),
    });
  });

  it('wordmark ink', () => {
    expect(componentsCss).toMatch(new RegExp(`--wordmark-ink:\\s*${WORDMARK_INK};`));
  });
});
