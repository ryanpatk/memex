import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, isLook, resolveLook } from './look';

describe('resolveLook', () => {
  it('defaults to Memory Cards', () => {
    expect(DEFAULT_LOOK).toBe('cards');
    expect(resolveLook({})).toBe('cards');
    expect(resolveLook({ query: null, stored: null, env: undefined })).toBe('cards');
  });

  it('can default to classic from the env', () => {
    expect(resolveLook({ env: 'classic' })).toBe('classic');
    expect(resolveLook({ env: 'cards' })).toBe('cards');
  });

  it('keeps a browser that remembered classic on classic (the escape hatch)', () => {
    expect(resolveLook({ stored: 'classic' })).toBe('classic');
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
    expect(resolveLook({ env: 'true' })).toBe('cards');
  });

  it('knows its looks', () => {
    expect(isLook('cards')).toBe(true);
    expect(isLook('classic')).toBe(true);
    expect(isLook('pastel')).toBe(false);
  });
});
