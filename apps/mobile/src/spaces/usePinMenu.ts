import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { movePin, pinLabel, pinPositionUpdates, type LinkWithTag, type PinPosition } from '@memex/core';
import { menuStore } from '../cards/menuStore';
import { useActions } from '../data/DataProvider';
import { useToast } from '../ui/Toast';

/*
 * A pinned site's long-press menu on the phone (the web drags pins into
 * order; this is the touch form): Open, Move earlier, Move later, Unpin with
 * Undo. The same rows are the pin's VoiceOver actions. Order and the writes'
 * places come from core's pins.ts, so the web and the phone agree. `spaceId`
 * null means the global pins (the Spaces tab); a space's id, its pins.
 */
export const usePinMenu = ({
  pins,
  spaceId,
  positions,
  onOpen,
}: {
  pins: LinkWithTag[];
  spaceId: string | null;
  /** Each pin's current place in this scope. */
  positions: ReadonlyMap<string, PinPosition>;
  onOpen: (linkId: string) => void;
}) => {
  const actions = useActions();
  const toast = useToast();

  const failed = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    toast.show('Couldn’t change the pins. Try again.', { tone: 'error' });
  }, [toast]);

  const move = useCallback(
    (from: number, to: number) => {
      const order = movePin(
        pins.map((p) => p.id),
        from,
        to,
      );
      const changes = pinPositionUpdates(order, positions).map(({ id, position }) => ({ id, pinned: true, position }));
      void Haptics.selectionAsync();
      actions.setPins(spaceId, changes).catch(failed);
    },
    [actions, failed, pins, positions, spaceId],
  );

  const unpin = useCallback(
    (link: LinkWithTag) => {
      const was = positions.get(link.id) ?? null;
      actions
        .setPins(spaceId, [{ id: link.id, pinned: false, position: null }])
        .then(() =>
          toast.show(`Unpinned ${pinLabel(link)}.`, {
            action: {
              label: 'Undo',
              onPress: () => {
                actions.setPins(spaceId, [{ id: link.id, pinned: true, position: was }]).catch(failed);
              },
            },
          }),
        )
        .catch(failed);
    },
    [actions, failed, positions, spaceId, toast],
  );

  /** The rows for one pin, for the long-press menu and VoiceOver. */
  const rows = useCallback(
    (link: LinkWithTag, index: number) => [
      { name: 'open', label: 'Open', run: () => onOpen(link.id) },
      ...(index > 0 ? [{ name: 'earlier', label: 'Move earlier', run: () => move(index, index - 1) }] : []),
      ...(index < pins.length - 1 ? [{ name: 'later', label: 'Move later', run: () => move(index, index + 1) }] : []),
      { name: 'unpin', label: 'Unpin', destructive: true, run: () => unpin(link) },
    ],
    [move, onOpen, pins.length, unpin],
  );

  const show = useCallback(
    (link: LinkWithTag, index: number) => {
      const all = rows(link, index);
      menuStore.open({
        title: pinLabel(link),
        sections: [{ items: all.filter((r) => !r.destructive) }, { items: all.filter((r) => r.destructive) }],
      });
    },
    [rows],
  );

  return { show, rows };
};
