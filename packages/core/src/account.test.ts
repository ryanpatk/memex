import { describe, expect, it } from 'vitest';
import { accountAvatar, accountAvatarUrl, sizedAvatarUrl } from './account';
import type { AuthUser } from './repository';

const user = (user_metadata: AuthUser['user_metadata'], email?: string): AuthUser => ({ id: 'u1', email, user_metadata });

describe('accountAvatar', () => {
  it('uses the GitHub avatar_url, with the handle as alt text', () => {
    const avatar = accountAvatar(
      user({ avatar_url: 'https://avatars.githubusercontent.com/u/123?v=4', user_name: 'octo', full_name: 'Octo Cat' }, 'o@example.com'),
    );
    expect(avatar).toEqual({ url: 'https://avatars.githubusercontent.com/u/123?v=4', initial: 'O', alt: 'octo' });
  });

  it('falls back to picture when avatar_url is missing', () => {
    expect(accountAvatarUrl(user({ picture: 'https://example.com/me.png' }))).toBe('https://example.com/me.png');
  });

  it('prefers avatar_url over picture', () => {
    expect(accountAvatarUrl(user({ avatar_url: 'https://a.example/1.png', picture: 'https://b.example/2.png' }))).toBe('https://a.example/1.png');
  });

  it('falls back to the letter when there is no picture', () => {
    expect(accountAvatar(user({ full_name: 'ryan' }, 'r@example.com'))).toEqual({ url: null, initial: 'R', alt: 'ryan' });
  });

  it('ignores empty, non-string, non-URL and non-https pictures', () => {
    for (const bad of ['', '   ', 42, 'not a url', 'http://example.com/me.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA']) {
      expect(accountAvatarUrl(user({ avatar_url: bad as string }))).toBeNull();
    }
  });

  it('skips a bad avatar_url and uses a good picture', () => {
    expect(accountAvatarUrl(user({ avatar_url: 'nope', picture: 'https://example.com/p.png' }))).toBe('https://example.com/p.png');
  });

  it('takes the letter from the name, then handle, then email', () => {
    expect(accountAvatar(user({ name: 'zed' })).initial).toBe('Z');
    expect(accountAvatar(user({ user_name: 'octo' })).initial).toBe('O');
    expect(accountAvatar(user({}, 'mail@example.com')).initial).toBe('M');
  });

  it('handles no user and no details', () => {
    expect(accountAvatar(null)).toEqual({ url: null, initial: '?', alt: 'Account' });
    expect(accountAvatar(user({}))).toEqual({ url: null, initial: '?', alt: 'Account' });
  });

  it('keeps a whole emoji or accented letter as the initial', () => {
    expect(accountAvatar(user({ full_name: '🦊 Fox' })).initial).toBe('🦊');
    expect(accountAvatar(user({ full_name: 'éa' })).initial).toBe('É');
  });
});

describe('sizedAvatarUrl', () => {
  it('sets GitHub’s size parameter, keeping the others', () => {
    expect(sizedAvatarUrl('https://avatars.githubusercontent.com/u/123?v=4', 112)).toBe('https://avatars.githubusercontent.com/u/123?v=4&s=112');
  });

  it('leaves other hosts and bad URLs alone', () => {
    expect(sizedAvatarUrl('https://example.com/me.png', 112)).toBe('https://example.com/me.png');
    expect(sizedAvatarUrl('nope', 112)).toBe('nope');
  });
});
