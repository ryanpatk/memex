import { describe, expect, it } from 'vitest';
import {
  MC_COLORS_DARK,
  MC_COLORS_LIGHT,
  MC_MOTION,
  MC_RADIUS,
  MC_SIZE,
  MC_SPACE,
  MC_SPACE_COLORS,
  MC_TYPE,
  type MemoryCardsColors,
} from '@memex/core';
import css from './cards/tokens.css?raw';

/*
 * @memex/core's Memory Cards constants are a copy of cards/tokens.css for
 * clients that can't read CSS variables (the Expo app). Change a token in the
 * CSS and this fails until tokens/memoryCards.ts matches.
 */

const block = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} block`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('\n}', start));
};
const vars = (text: string) =>
  Object.fromEntries([...text.matchAll(/--mc-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

const light = vars(block('html:root'));
const dark = { ...light, ...vars(block("html:root[data-theme='dark']")) };
const px = (v: string) => Number(v.replace(/px$/, ''));

const COLOR_VARS: Record<keyof Omit<MemoryCardsColors, 'noteTint'>, string> = {
  ink: 'ink',
  muted: 'mut',
  faint: 'faint',
  line: 'line',
  bg: 'bg-base',
  paper: 'paper',
  well: 'well',
  notePaper: 'notep',
  primary: 'pri',
  primaryInk: 'pri-ink',
  ring: 'ring',
  ok: 'ok',
  warn: 'warn',
  error: 'err',
  errorBg: 'err-bg',
  toast: 'toast',
  agent: 'agent',
  agentBg: 'agent-bg',
  onColor: 'on-c',
};

describe('Memory Cards tokens match cards/tokens.css', () => {
  it.each(['light', 'dark'] as const)('%s colours', (mode) => {
    const source = mode === 'light' ? light : dark;
    const colors = mode === 'light' ? MC_COLORS_LIGHT : MC_COLORS_DARK;
    for (const [key, name] of Object.entries(COLOR_VARS)) {
      expect(source[name]?.toLowerCase(), `${mode} ${key}`).toBe(colors[key as keyof typeof COLOR_VARS].toLowerCase());
    }
    expect(source.tint).toBe(`${colors.noteTint}%`);
  });

  it('type scale', () => {
    expect(px(light['t-hero'])).toBe(MC_TYPE.hero);
    expect(px(light['t-hero-m'])).toBe(MC_TYPE.heroPhone);
    expect(px(light['t-h1'])).toBe(MC_TYPE.h1);
    expect(px(light['t-h2'])).toBe(MC_TYPE.h2);
    expect(px(light['t-h3'])).toBe(MC_TYPE.h3);
    expect(px(light['t-body'])).toBe(MC_TYPE.body);
    expect(px(light['t-lab'])).toBe(MC_TYPE.label);
  });

  it('spacing, radii, sizes and motion', () => {
    MC_SPACE.forEach((value, index) => expect(px(light[`s${index + 1}`])).toBe(value));
    expect(px(light['r-chip'])).toBe(MC_RADIUS.chip);
    expect(px(light['r-pic'])).toBe(MC_RADIUS.picture);
    expect(px(light['r-card'])).toBe(MC_RADIUS.card);
    expect(px(light['r-sheet'])).toBe(MC_RADIUS.sheet);
    expect(px(light.hit)).toBe(MC_SIZE.hit);
    expect(px(light.ctl)).toBe(MC_SIZE.control);
    expect(px(light['ctl-sm'])).toBe(MC_SIZE.controlSmall);
    expect(px(light['label-h'])).toBe(MC_SIZE.label);
    expect(light['m-press']).toBe(`${MC_MOTION.press}ms`);
    expect(light['m-base']).toBe(`${MC_MOTION.base}ms`);
    expect(light['m-write']).toBe(`${MC_MOTION.write}ms`);
  });

  it('space colours', () => {
    const names = ['coral', 'cyan', 'gold', 'blue', 'vio', 'green', 'orange', 'pink'];
    MC_SPACE_COLORS.forEach((color, index) => expect(light[names[index]]).toBe(color.value));
  });

  it('nothing smaller than the label size', () => {
    expect(Math.min(...Object.values(MC_TYPE))).toBe(MC_TYPE.label);
  });
});
