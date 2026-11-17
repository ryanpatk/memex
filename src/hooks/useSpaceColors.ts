import { useMemo, useSyncExternalStore } from 'react';
import { useProfiles } from './useProfiles';
import { MC_SPACE_COLOR_VALUES, buildSpaceColors } from '@memex/core';
import { readLocalSpaceColors, subscribeLocalSpaceColors, withLocalColors } from '../utils/spaceColorFallback';

let localSnapshot = '';
const localKey = () => {
  const next = JSON.stringify(readLocalSpaceColors());
  if (next !== localSnapshot) localSnapshot = next;
  return localSnapshot;
};

/**
 * Space id → identity colour (see @memex/core tokens/spaceColors). A colour
 * the user chose wins; otherwise Memory Cards' eight space colours are
 * assigned by creation order.
 */
export const useSpaceColors = () => {
  const { data: profiles } = useProfiles();
  const local = useSyncExternalStore(subscribeLocalSpaceColors, localKey, () => '{}');
  return useMemo(
    () =>
      buildSpaceColors(
        withLocalColors(profiles, JSON.parse(local) as Record<string, string>),
        MC_SPACE_COLOR_VALUES,
      ),
    [local, profiles],
  );
};
