import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, isLook, resolveLook } from './look';

describe('the phone look flag', () => {
  it('defaults to the classic look', () => {
    expect(DEFAULT_LOOK).toBe('classic');
    expect(resolveLook({})).toBe('classic');
    expect(resolveLook({ stored: null, env: '' })).toBe('classic');
  });

  it('turns on from EXPO_PUBLIC_MEMEX_LOOK', () => {
    expect(resolveLook({ env: 'cards' })).toBe('cards');
    expect(resolveLook({ env: ' Cards ' })).toBe('cards');
  });

  it('prefers the choice made in the app over the env', () => {
    expect(resolveLook({ stored: 'classic', env: 'cards' })).toBe('classic');
    expect(resolveLook({ stored: 'cards', env: '' })).toBe('cards');
  });

  it('ignores values it doesn’t know', () => {
    expect(resolveLook({ stored: 'neon', env: 'cards' })).toBe('cards');
    expect(resolveLook({ env: '1' })).toBe('classic');
    expect(isLook('cards')).toBe(true);
    expect(isLook('pastel')).toBe(false);
  });
});
