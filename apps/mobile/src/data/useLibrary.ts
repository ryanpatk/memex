import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useHiddenEntries, useRepository } from './DataProvider';
import { keys } from './keys';
import { LIBRARY_PAGE, libraryItems, sourceTabs, type LibraryQuery } from './library';

/**
 * The Library's links for a source and search, a page at a time (infinite
 * scroll: `loadMore` reveals the next page). Reads the same `links` query as
 * the Journal, so a save in one shows in the other at once.
 */
export const useLibrary = (query: LibraryQuery) => {
  const repository = useRepository();
  const hidden = useHiddenEntries();
  const links = useQuery({ queryKey: keys.links, queryFn: () => repository.links.getAll() });
  const [refreshing, setRefreshing] = useState(false);

  const visible = useMemo(
    () => (links.data ?? []).filter((link) => !hidden.has(`link:${link.id}`)),
    [hidden, links.data],
  );
  const items = useMemo(() => libraryItems(visible, query), [query, visible]);
  const tabs = useMemo(() => sourceTabs(visible), [visible]);

  // A new source or search starts again from the first page.
  const [limit, setLimit] = useState(LIBRARY_PAGE);
  const [seen, setSeen] = useState(query);
  if (seen.source !== query.source || seen.search !== query.search) {
    setSeen(query);
    setLimit(LIBRARY_PAGE);
  }

  const hasMore = items.length > limit;
  const loadMore = useCallback(() => {
    if (hasMore) setLimit((n) => n + LIBRARY_PAGE);
  }, [hasMore]);

  const { refetch } = links;
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  return {
    items: items.slice(0, limit),
    matching: items.length,
    total: tabs[0].count,
    tabs,
    hasMore,
    loadMore,
    refresh,
    refreshing,
    isLoading: links.isPending,
    error: links.error,
  };
};
