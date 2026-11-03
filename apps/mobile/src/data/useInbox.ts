import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRepository } from './DataProvider';
import { toProposalView } from './inbox';
import { keys } from './keys';
import { useJournal } from './useJournal';

/*
 * The Inbox (CONTEXT.md): agents' pending proposals plus the filer's
 * suggestions for recent unfiled items. Agents write proposals from
 * elsewhere, so the list refreshes every minute while the app is open, like
 * the web's. `count` is what the tab's badge shows: both kinds together.
 * `unavailable` is the Journal's (FeedError); `proposalsFailed` only the
 * agents' half, shown as an inline row with Try again.
 */
export const useProposals = () => {
  const repository = useRepository();
  return useQuery({ queryKey: keys.proposals, queryFn: () => repository.proposals.getPending(), refetchInterval: 60_000 });
};

export const useInbox = () => {
  const { journal, isLoading, unavailable, error, refreshing, refresh } = useJournal();
  const proposals = useProposals();
  // Proposals that never loaded aren't “none”: the screen says so inline.
  const proposalsFailed = proposals.isError && proposals.data === undefined;
  const views = useMemo(() => {
    if (!journal || !proposals.data) return [];
    const byKey = new Map(journal.entries.map((e) => [e.id, e]));
    return proposals.data.map((p) => toProposalView(p, byKey, journal.spaces));
  }, [journal, proposals.data]);
  const suggestions = journal?.inbox ?? [];
  return {
    journal,
    proposals: views,
    suggestions,
    count: suggestions.length + (proposals.data?.length ?? 0),
    isLoading: isLoading || proposals.isPending,
    unavailable,
    error,
    proposalsFailed,
    retryingProposals: proposalsFailed && proposals.isFetching,
    retryProposals: () => void proposals.refetch(),
    refreshing,
    refresh: async () => {
      await Promise.all([refresh(), proposals.refetch()]);
    },
  };
};
