import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { repository } from '../data/repository';
import { readOAuthRedirect } from './oauth';

WebBrowser.maybeCompleteAuthSession();

/**
 * Where GitHub (via Supabase) sends the user back. Release builds:
 * `memex://auth/callback`; Expo Go: `exp://<host>:8081/--/auth/callback`.
 * Both must be allowed in Supabase Auth → URL Configuration (docs/mobile.md).
 */
export const oauthRedirectUrl = () => Linking.createURL('auth/callback');

/** GitHub sign-in in an auth browser session, finished with a PKCE code exchange. */
export const signInWithGitHub = async (): Promise<{ error: string | null }> => {
  const redirectTo = oauthRedirectUrl();
  const start = await repository.auth.signInWithOAuth('github', { redirectTo, skipBrowserRedirect: true });
  if (start.error) return { error: start.error.message };
  if (!start.url) return { error: null }; // demo mode signs in directly

  const result = await WebBrowser.openAuthSessionAsync(start.url, redirectTo);
  if (result.type !== 'success') return { error: null };

  const redirect = readOAuthRedirect(result.url);
  if ('error' in redirect) return { error: redirect.error };
  if ('cancelled' in redirect) return { error: null };
  const { error } = await repository.auth.exchangeCodeForSession(redirect.code);
  return { error: error?.message ?? null };
};
