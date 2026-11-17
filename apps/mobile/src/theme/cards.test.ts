import { describe, expect, it } from 'vitest';
import { MC_COLORS_DARK, MC_COLORS_LIGHT, MC_SPACE_COLORS, MC_TYPE } from '@memex/core';
import { buildCardsPalette, buildCardsTheme, cardsTextRole, noteTint } from './cards';

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/;

describe('the Memory Cards palette', () => {
  it.each([false, true])('gives every role a plain hex colour (dark=%s)', (dark) => {
    for (const [role, value] of Object.entries(buildCardsPalette(dark))) {
      if (role === 'dark') continue;
      expect(value, role).toMatch(HEX);
    }
  });

  it('comes from core’s Memory Cards tokens, with a flat canvas', () => {
    const light = buildCardsPalette(false);
    expect(light.ink).toBe(MC_COLORS_LIGHT.ink);
    expect(light.canvas).toBe(MC_COLORS_LIGHT.bg);
    expect(light.canvasTop).toBe(light.canvas);
    expect(light.accent).toBe(MC_COLORS_LIGHT.primary);
    expect(buildCardsPalette(true).paper).toBe(MC_COLORS_DARK.paper);
  });

  it('hands spaces the eight Memory Cards colours in order', () => {
    expect(buildCardsTheme(false).spaceColors).toEqual(MC_SPACE_COLORS.map((c) => c.value));
  });

  it('tints notes from their space, unfiled notes on note paper', () => {
    const theme = buildCardsTheme(false);
    expect(noteTint(null, theme)).toBe(MC_COLORS_LIGHT.notePaper);
    expect(noteTint('#ff5a6f', theme)).toMatch(/^#[0-9a-f]{6}$/);
    expect(noteTint('#ff5a6f', theme)).not.toBe('#ff5a6f');
  });
});

describe('type in the Memory Cards look', () => {
  it('never goes under the 16px label size', () => {
    for (const size of ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl'] as const) {
      for (const weight of ['regular', 'medium', 'heavy'] as const) {
        expect(cardsTextRole(size, weight).fontSize, `${size}/${weight}`).toBeGreaterThanOrEqual(MC_TYPE.label);
      }
    }
  });

  it('sets heavy text and headings in rounded Nunito, body in Inter', () => {
    expect(cardsTextRole('l', 'heavy').fontFamily).toMatch(/^Nunito/);
    expect(cardsTextRole('xl').fontFamily).toMatch(/^Nunito/);
    expect(cardsTextRole('m').fontFamily).toMatch(/^Inter/);
    expect(cardsTextRole('m').fontSize).toBe(MC_TYPE.body);
  });
});
