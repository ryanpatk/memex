import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, isLook, resolveLook } from './look';

describe('resolveLook', () => {
  it('defaults to the classic look, so prod is unaffected', () => {
    expect(DEFAULT_LOOK).toBe('classic');
    expect(resolveLook({})).toBe('classic');
    expect(resolveLook({ query: null, stored: null, env: undefined })).toBe('classic');
  });

  it('turns on from the env', () => {
    expect(resolveLook({ env: 'cards' })).toBe('cards');
  });

  it('prefers a remembered choice over the env', () => {
    expect(resolveLook({ stored: 'classic', env: 'cards' })).toBe('classic');
    expect(resolveLook({ stored: 'cards', env: 'classic' })).toBe('cards');
  });

  it('prefers the URL over everything', () => {
    expect(resolveLook({ query: 'classic', stored: 'cards', env: 'cards' })).toBe('classic');
    expect(resolveLook({ query: 'cards', stored: 'classic' })).toBe('cards');
  });

  it('ignores unknown values and is forgiving about case and spaces', () => {
    expect(resolveLook({ query: 'neon', stored: 'cards' })).toBe('cards');
    expect(resolveLook({ query: ' Cards ' })).toBe('cards');
    expect(resolveLook({ env: 'true' })).toBe('classic');
  });

  it('knows its looks', () => {
    expect(isLook('cards')).toBe(true);
    expect(isLook('classic')).toBe(true);
    expect(isLook('pastel')).toBe(false);
  });
});
