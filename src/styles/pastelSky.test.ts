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
 * can't read CSS variables. Since Memory Cards became the only web look
 * (2026-11-17), pastel-sky.css keeps only the tokens the web still uses, so
 * this checks every token it still defines: change one and the test fails
 * until tokens/pastelSky.ts matches. Tokens the web dropped live on in core
 * alone.
 */

const block = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  return start === -1 ? '' : css.slice(start, css.indexOf('\n}', start));
};
const vars = (text: string) =>
  Object.fromEntries([...text.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

const light = vars(block(':root'));
const dark = { ...light, ...vars(block("[data-theme='dark']")) };

const colorVars = (k: keyof PastelSkyColors) =>
  k === 'accentText' ? 'cte-accent-text' : k.replace(/^(color|neutral)(\d+)$/, '$1-$2');

const px = (v: string) => Number(v.replace(/px$/, ''));
const em = (v: string) => Number(v.replace(/em$/, ''));

/** Compares a core value with its CSS token when the CSS still defines it; counts the checks made. */
const checked = { count: 0 };
const matchIfDefined = (label: string, coreValue: unknown, cssValue: string | undefined, parse: (v: string) => unknown = (v) => v) => {
  if (cssValue === undefined) return;
  checked.count += 1;
  expect([label, coreValue]).toEqual([label, parse(cssValue)]);
};

describe('Pastel Sky tokens match pastel-sky.css', () => {
  it.each(['light', 'dark'] as const)('%s colours', (mode) => {
    const source = mode === 'light' ? light : dark;
    for (const [key, value] of Object.entries(PASTEL_SKY_COLORS[mode])) {
      matchIfDefined(key, value, source[colorVars(key as keyof PastelSkyColors)]);
    }
  });

  it('type scale', () => {
    for (const [size, role] of Object.entries(TYPE_SCALE)) {
      matchIfDefined(`size-${size}`, role.size, light[`size-${size}`], px);
      matchIfDefined(`line-${size}`, role.line, light[`line-${size}`], px);
      matchIfDefined(`letter-spacing-${size}`, role.letterSpacing, light[`letter-spacing-${size}`], em);
    }
  });

  it('spacing and radius', () => {
    for (const [k, v] of Object.entries(SPACE)) matchIfDefined(`space-${k}`, v, light[`space-${k}`], px);
    for (const [k, v] of Object.entries(RADIUS)) matchIfDefined(`radius-${k}`, v, light[`radius-${k}`], px);
  });

  it('weights, motion and depth', () => {
    matchIfDefined('weight-ui-regular', FONT_WEIGHTS.regular, light['weight-ui-regular'], Number);
    matchIfDefined('weight-ui-medium', FONT_WEIGHTS.medium, light['weight-ui-medium'], Number);
    matchIfDefined('weight-ui-heavy', FONT_WEIGHTS.heavy, light['weight-ui-heavy'], Number);
    const ms = (v: string) => Number(v.replace('ms', ''));
    matchIfDefined('motion-duration', MOTION.duration, light['motion-duration'], ms);
    matchIfDefined('motion-large-duration', MOTION.largeDuration, light['motion-large-duration'], ms);
    matchIfDefined('motion-press-distance', MOTION.pressDistance, light['motion-press-distance'], px);
    matchIfDefined('motion-popup-scale', MOTION.popupScale, light['motion-popup-scale'], Number);
    matchIfDefined('hover-swell', DEPTH.hoverSwell, light['hover-swell'], Number);
    matchIfDefined('hover-swell-icon', DEPTH.hoverSwellIcon, light['hover-swell-icon'], Number);
    matchIfDefined('hover-lift', DEPTH.hoverLift, light['hover-lift'], px);
    matchIfDefined('press-settle', DEPTH.pressSettle, light['press-settle'], Number);
  });

  it('still checks the tokens the web uses', () => {
    // The palette, neutrals and type scale are still in use (Journal, List,
    // Table, note editor): if this drops to zero the file moved or emptied
    expect(checked.count).toBeGreaterThan(20);
  });

  it('wordmark ink', () => {
    expect(componentsCss).toMatch(new RegExp(`--wordmark-ink:\\s*${WORDMARK_INK};`));
  });
});
