import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { movePin, orderSpaces, pinPositionUpdates, spacePositions, type Profile } from '@memex/core';
import { repository } from '../data/repository';
import { profileKeys, useProfiles } from './useProfiles';

/*
 * Space order and hiding (docs/spaces-row.md): Edit spaces moves spaces and
 * hides them from the pill rows. The profiles list is patched first, so the
 * rows and the sheet move at once; the writes go through the Repository and
 * a failure refetches and rethrows for the caller to report. Moves renumber
 * every space 1…n (core pinPositionUpdates) but write only the ones whose
 * number changed.
 */
export function useSpaceOrder() {
  const queryClient = useQueryClient();
  const { data: spaces } = useProfiles();

  const patch = useCallback(
    async (changes: Map<string, Partial<Profile>>) => {
      await queryClient.cancelQueries({ queryKey: profileKeys.lists() });
      queryClient.setQueryData<Profile[]>(profileKeys.lists(), (old) =>
        old ? orderSpaces(old.map((space) => (changes.has(space.id) ? { ...space, ...changes.get(space.id) } : space))) : old,
      );
      try {
        await Promise.all([...changes].map(([id, updates]) => repository.spaces.update(id, updates)));
      } catch (error) {
        void queryClient.invalidateQueries({ queryKey: profileKeys.lists() });
        throw error;
      }
    },
    [queryClient],
  );

  /** Moves the space at `from` to `to` (indexes in the ordered list of every space). */
  const move = useCallback(
    async (from: number, to: number) => {
      const list = spaces ?? [];
      if (from === to || !list[from]) return;
      const order = movePin(
        list.map((space) => space.id),
        from,
        to,
      );
      const updates = pinPositionUpdates(order, spacePositions(list));
      await patch(new Map(updates.map(({ id, position }) => [id, { position }])));
    },
    [patch, spaces],
  );

  const setHidden = useCallback((id: string, hidden: boolean) => patch(new Map([[id, { hidden }]])), [patch]);

  return { spaces: spaces ?? [], move, setHidden };
}
