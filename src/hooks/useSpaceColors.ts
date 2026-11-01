import { useMemo } from 'react';
import { useProfiles } from './useProfiles';
import { buildSpaceColors } from '@memex/core';

/** Space id → identity colour (see @memex/core tokens/spaceColors). */
export const useSpaceColors = () => {
  const { data: profiles } = useProfiles();
  return useMemo(() => buildSpaceColors(profiles), [profiles]);
};
