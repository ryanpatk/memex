import { describe, expect, it } from 'vitest';
import { readOAuthRedirect } from './oauth';

describe('readOAuthRedirect', () => {
  it('reads the PKCE code from the app scheme and from Expo Go URLs', () => {
    expect(readOAuthRedirect('memex://auth/callback?code=abc-123')).toEqual({ code: 'abc-123' });
    expect(readOAuthRedirect('exp://192.168.1.4:8081/--/auth/callback?code=xyz')).toEqual({ code: 'xyz' });
  });

  it('reports provider errors from the query or the fragment', () => {
    expect(readOAuthRedirect('memex://auth/callback?error=access_denied&error_description=User+said+no')).toEqual({
      error: 'User said no',
    });
    expect(readOAuthRedirect('memex://auth/callback#error=server_error')).toEqual({ error: 'server_error' });
  });

  it('treats a bare redirect as cancelled', () => {
    expect(readOAuthRedirect('memex://auth/callback')).toEqual({ cancelled: true });
  });
});
