import type { AuthUser } from '@memex/core';

/** Best human label for the signed-in user: full name, then name, then email. */
export const userDisplayName = (user: AuthUser | null) =>
  user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'Signed in';
