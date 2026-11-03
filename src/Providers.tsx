import { Outlet } from "react-router-dom";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/query-persist-client-core";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { SessionProvider } from "./context/SessionContext";
import { mutationErrorMessage, shouldReportMutationError } from "./utils/mutationErrors";
import { notices } from "./utils/notices";

// For now, we'll use Chakra UI with default theme and rely on Tailwind for custom styling

// Create a persister using localStorage
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'EX_P02_REACT_QUERY_OFFLINE_CACHE',
});

// Create a client instance.
// The persisted cache exists for instant paint on load — not as a source of
// truth. Keep staleTime short and revalidate on focus so a tab (or another
// device) never sits on old data: restored/hydrated queries refetch right
// away, and switching back to a memex tab picks up writes made elsewhere.
const queryClient = new QueryClient({
  // A failed write is never silent: unless the mutation's caller reports it
  // itself (`meta.handlesErrors`, set by passing HANDLES_ERRORS to the hook;
  // the rule is in utils/mutationErrors.ts), the shell shows one generic,
  // polite toast (components/ShellNotices.tsx).
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (!shouldReportMutationError(mutation.meta)) return;
      console.error("A write failed:", error);
      notices.publish(mutationErrorMessage(navigator.onLine));
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds — dedupes rapid remounts only
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      refetchOnWindowFocus: true,
    },
    // Writes run (and fail fast) offline instead of pausing until the network
    // returns: React Query's default 'online' mode would leave a send pending
    // forever, its optimistic row hanging, with nothing said. Reads keep the
    // default (they pause, and pages show "Couldn't load…" when there's nothing cached).
    mutations: {
      networkMode: "always",
    },
  },
});

// Persist the query client cache
// Type assertion needed due to version mismatch between @tanstack/react-query and persist packages
const [, restorePromise] = persistQueryClient({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- persist client typings lag behind @tanstack/react-query QueryClient
  queryClient: queryClient as any,
  persister,
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  // Bumped 2026-09-07: discard old snapshots that included the retired
  // 'scraper' display cache (it overlaid stale titles on re-scraped links).
  buster: '2026-09-07-fresh-reads',
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      // Persist stored data only — scraped metadata lives on the link rows
      // now, so the legacy 'scraper' cache is deliberately not persisted.
      const queryKey = query.queryKey;
      if (Array.isArray(queryKey)) {
        const firstKey = queryKey[0];
        return (
          firstKey === 'links' ||
          firstKey === 'projects' ||
          firstKey === 'tags' ||
          firstKey === 'profiles' ||
          firstKey === 'profile-links' ||
          firstKey === 'tasks' ||
          firstKey === 'profile-tasks' ||
          firstKey === 'notes' ||
          firstKey === 'profile-notes'
        );
      }
      return false;
    },
  },
});

restorePromise?.catch(() => {
  // Swallow restore errors (e.g., corrupted cache with non-thenable promises)
});

const Providers = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Outlet />
      </SessionProvider>
    </QueryClientProvider>
  );
};

export default Providers;
