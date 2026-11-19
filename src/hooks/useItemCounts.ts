import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { repository } from '../data/repository';

/** The lists whose changes change the counts. */
const WATCHED = new Set(['links', 'notes', 'tasks', 'self-messages']);

export const itemCountKeys = { all: ['item-counts'] as const };

/**
 * Exact item counts from the database (core CountsRepository: count queries,
 * no rows), for the Cards hero's total (core stream/cardsCount.ts). Whenever
 * a links, notes, tasks or jots list changes in the cache (a save, an edit,
 * a delete, a refetch) the counts are fetched again, so the total follows
 * what you do within a moment.
 */
export const useItemCounts = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      const head = event.query.queryKey[0];
      if (typeof head !== 'string' || !WATCHED.has(head)) return;
      // One refetch for a burst of list updates
      clearTimeout(timer);
      timer = setTimeout(() => void queryClient.invalidateQueries({ queryKey: itemCountKeys.all }), 150);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [queryClient]);

  return useQuery({ queryKey: itemCountKeys.all, queryFn: () => repository.counts.get() });
};
