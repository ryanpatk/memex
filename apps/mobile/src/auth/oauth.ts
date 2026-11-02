/*
 * Reading the OAuth redirect (memex://auth/callback?code=…). Supabase's PKCE
 * flow puts `code` in the query; failures come back as `error` /
 * `error_description` in the query or the fragment.
 */

export type OAuthRedirect = { code: string } | { error: string } | { cancelled: true };

const paramsOf = (url: string) => {
  const params = new Map<string, string>();
  const add = (part: string | undefined) =>
    (part ?? '').split('&').forEach((pair) => {
      if (!pair) return;
      const [k, v = ''] = pair.split('=');
      params.set(decodeURIComponent(k), decodeURIComponent(v.replace(/\+/g, ' ')));
    });
  const [beforeHash, hash] = url.split('#');
  add(beforeHash.split('?')[1]);
  add(hash);
  return params;
};

export const readOAuthRedirect = (url: string): OAuthRedirect => {
  const params = paramsOf(url);
  const code = params.get('code');
  if (code) return { code };
  const error = params.get('error_description') ?? params.get('error');
  if (error) return { error };
  return { cancelled: true };
};
