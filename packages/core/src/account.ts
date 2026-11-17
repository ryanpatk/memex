import type { AuthUser } from './repository';

/**
 * What the account button shows for the signed-in user: their provider
 * picture when there is one (GitHub OAuth fills `avatar_url`, others
 * `picture`), otherwise one letter. Only reads the auth session's metadata.
 */
export interface AccountAvatar {
  /** An https picture URL, or null to show `initial`. */
  url: string | null;
  /** The letter shown when there's no picture or it fails to load. */
  initial: string;
  /** Alt text for the picture: the GitHub handle, else the name or email. */
  alt: string;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** The picture URL from the session, if it is a usable https URL. */
export const accountAvatarUrl = (user: AuthUser | null | undefined): string | null => {
  const meta = user?.user_metadata;
  for (const candidate of [text(meta?.avatar_url), text(meta?.picture)]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:') return url.toString();
    } catch {
      // not a URL; try the next field
    }
  }
  return null;
};

/**
 * Asks GitHub for a picture `px` pixels square (its `s` parameter), so a
 * small disc doesn't download the full-size upload. Other hosts are left alone.
 */
export const sizedAvatarUrl = (url: string, px: number): string => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'avatars.githubusercontent.com') return url;
    parsed.searchParams.set('s', String(Math.max(1, Math.round(px))));
    return parsed.toString();
  } catch {
    return url;
  }
};

export const accountAvatar = (user: AuthUser | null | undefined): AccountAvatar => {
  const meta = user?.user_metadata;
  const handle = text(meta?.user_name) || text(meta?.preferred_username);
  const name = text(meta?.full_name) || text(meta?.name);
  const email = text(user?.email);
  const label = name || handle || email;
  const first = Array.from(label)[0];
  return {
    url: accountAvatarUrl(user),
    initial: first ? first.toUpperCase() : '?',
    alt: handle || name || email || 'Account',
  };
};
