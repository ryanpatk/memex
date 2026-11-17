import { useCallback } from 'react';
import { useUpdateProfile } from './useProfiles';
import { HANDLES_ERRORS } from '../utils/mutationErrors';
import { writeLocalSpaceColor, hasColorColumn } from '../utils/spaceColorFallback';
import type { Profile } from '@memex/core';

/**
 * Saves a space's chosen colour (decision x11 B). With the `profiles.color`
 * column it goes to the database; without it (migration not applied) it is
 * kept in this browser only, so the picker still works locally. `null` goes
 * back to the automatic colour. Resolves to where the colour was kept.
 */
export const useSetSpaceColor = () => {
  const update = useUpdateProfile(HANDLES_ERRORS);
  return useCallback(
    async (space: Profile, color: string | null): Promise<'database' | 'browser'> => {
      if (!hasColorColumn(space)) {
        writeLocalSpaceColor(space.id, color);
        return 'browser';
      }
      await update.mutateAsync({ id: space.id, updates: { color } });
      writeLocalSpaceColor(space.id, null);
      return 'database';
    },
    [update],
  );
};
