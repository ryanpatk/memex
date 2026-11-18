import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { movePin, pinPositionUpdates, spacePositions, type Profile } from '@memex/core';
import { menuStore } from '../cards/menuStore';
import { useActions } from '../data/DataProvider';
import { keys } from '../data/keys';
import { useToast } from '../ui/Toast';

/*
 * A space tile's long-press menu on the Spaces tab (the web's Edit spaces
 * sheet, in touch form): Move earlier, Move later, and Hide from the Cards
 * row / Show in the Cards row. The same rows are the tile's VoiceOver
 * actions. Order comes from core (spaceOrder.ts + pins.ts' movePin and
 * pinPositionUpdates), so the web and the phone agree; colours never move.
 */
export const useSpaceMenu = () => {
  const queryClient = useQueryClient();
  const actions = useActions();
  const toast = useToast();

  const failed = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    toast.show('Couldn’t change the spaces. Try again.', { tone: 'error' });
  }, [toast]);

  const rows = useCallback(
    (spaceId: string) => {
      const spaces = queryClient.getQueryData<Profile[]>(keys.spaces) ?? [];
      const index = spaces.findIndex((s) => s.id === spaceId);
      const space = spaces[index];
      if (!space) return [];
      const move = (to: number) => {
        const order = movePin(
          spaces.map((s) => s.id),
          index,
          to,
        );
        void Haptics.selectionAsync();
        actions.setSpaces(pinPositionUpdates(order, spacePositions(spaces))).catch(failed);
      };
      return [
        ...(index > 0 ? [{ name: 'earlier', label: 'Move earlier', run: () => move(index - 1) }] : []),
        ...(index < spaces.length - 1 ? [{ name: 'later', label: 'Move later', run: () => move(index + 1) }] : []),
        {
          name: 'hide',
          label: space.hidden ? 'Show in the Cards row' : 'Hide from the Cards row',
          run: () => {
            actions.setSpaces([{ id: space.id, hidden: !space.hidden }]).catch(failed);
          },
        },
      ];
    },
    [actions, failed, queryClient],
  );

  const show = useCallback(
    (spaceId: string, name: string) => {
      menuStore.open({ title: name, sections: [{ items: rows(spaceId) }] });
    },
    [rows],
  );

  return { show, rows };
};
