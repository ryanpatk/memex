/*
 * Which look the phone wears (Memory Cards, design/memory-cards/; web:
 * src/look/look.ts):
 * - 'classic' — Pastel Sky, the app as it ships today. The default.
 * - 'cards'   — Memory Cards, the redesign Ryan approved on 2026-11-16.
 *
 * Strongest first: the choice made in the app (account sheet → “New look”,
 * kept in AsyncStorage under LOOK_STORAGE_KEY), then
 * `EXPO_PUBLIC_MEMEX_LOOK=cards` at build time, then 'classic'. Plain TS so
 * it's unit-tested.
 */

export type Look = 'classic' | 'cards';

export const DEFAULT_LOOK: Look = 'classic';
export const LOOK_STORAGE_KEY = 'memex.look';

export const isLook = (value: unknown): value is Look => value === 'classic' || value === 'cards';

/** The look from the remembered choice and the env, in that order. */
export const resolveLook = ({ stored, env }: { stored?: string | null; env?: string | null }): Look => {
  for (const candidate of [stored, env]) {
    const value = candidate?.trim().toLowerCase();
    if (isLook(value)) return value;
  }
  return DEFAULT_LOOK;
};

/** process.env.EXPO_PUBLIC_X must be written out in full for Expo to inline it. */
export const ENV_LOOK = process.env.EXPO_PUBLIC_MEMEX_LOOK ?? '';
