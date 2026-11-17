import { useState, type ReactNode } from 'react';
import { accountAvatar, sizedAvatarUrl, type AuthUser } from '@memex/core';

interface AccountAvatarProps {
  user: AuthUser | null;
  /** Rendered size in CSS pixels; the picture is fetched at twice that. */
  size: number;
  className?: string;
  /** Shown when there's no picture or it fails to load; defaults to the user's initial. */
  fallback?: ReactNode;
}

/**
 * The signed-in user's provider picture (GitHub's avatar), round, at a fixed
 * size so nothing shifts while it loads. Falls back to the letter (or the
 * given fallback) when the session has no picture or the image fails.
 */
const AccountAvatar = ({ user, size, className, fallback }: AccountAvatarProps) => {
  const { url, initial, alt } = accountAvatar(user);
  const [failed, setFailed] = useState<string | null>(null);

  if (!url || failed === url) return <>{fallback ?? initial}</>;

  return (
    <img
      src={sizedAvatarUrl(url, size * 2)}
      alt={alt}
      width={size}
      height={size}
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      className={className}
      onError={() => setFailed(url)}
    />
  );
};

export default AccountAvatar;
