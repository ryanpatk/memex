import { useCallback, useMemo } from 'react';
import { planJotMoves, type JotMove } from '@memex/core';
import { useAllSelfMessages, useUpdateSelfMessage } from './useSelfMessages';

/**
 * Moving jots between spaces (a jot lives in one place: a space, or the
 * Journal when unfiled). `plan` turns stream keys into moves (core's
 * `planJotMoves`); `apply` writes them through `repository.jots.update`.
 * useAddToSpace and useRemoveFromSpace use it, so “File to…”, drag onto a
 * sidebar space and the selection bar all move jots, with their Undo.
 */
export function useMoveJots() {
  const { data: jots } = useAllSelfMessages();
  const update = useUpdateSelfMessage();

  const plan = useCallback((keys: string[], to: string | null) => planJotMoves(jots ?? [], keys, to), [jots]);

  const apply = useCallback(
    (moves: JotMove[]) =>
      Promise.all(moves.map(({ id, to }) => update.mutateAsync({ id, updates: { profile_id: to } }))),
    [update],
  );

  return useMemo(() => ({ plan, apply }), [apply, plan]);
}
