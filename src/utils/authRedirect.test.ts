import { describe, expect, it } from 'vitest';
import { nextPathFromSearch, safeNextPath, signInPathFor } from './authRedirect';

describe('safeNextPath', () => {
  it('keeps same-origin app paths with query and hash', () => {
    expect(safeNextPath('/library?type=link#x')).toBe('/library?type=link#x');
  });

  it.each([null, undefined, '', 'library', 'https://evil.dev', '//evil.dev', '/\\evil.dev', '/auth/sign-in', '/auth/sign-up?x=1'])(
    'rejects %j',
    (value) => {
      expect(safeNextPath(value)).toBeNull();
    },
  );

  it('normalizes dot segments before checking', () => {
    expect(safeNextPath('/library/../auth/sign-in')).toBeNull();
  });
});

describe('sign-in round trip', () => {
  it('only adds ?next= for paths other than the Journal', () => {
    expect(signInPathFor('/')).toBe('/auth/sign-in');
    expect(signInPathFor('/library?type=task')).toBe('/auth/sign-in?next=%2Flibrary%3Ftype%3Dtask');
    expect(signInPathFor('https://evil.dev')).toBe('/auth/sign-in');
  });

  it('reads the target back, falling back to the Journal', () => {
    expect(nextPathFromSearch('?next=%2Flibrary')).toBe('/library');
    expect(nextPathFromSearch('?next=https%3A%2F%2Fevil.dev')).toBe('/');
    expect(nextPathFromSearch('')).toBe('/');
  });
});
