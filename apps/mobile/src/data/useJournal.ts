import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../theme/theme';
import { toJournal } from './journal';
import { repository } from './repository';

/*
 * React Query over the Repository for the Journal (read-only for now). One
 * query per resource, keyed like the web's hooks, so a shared @memex/react
 * package can take these over later. Every tab reads this; React Query
 * dedupes the fetches.
 */

export const useJournal = () => {
  const { palette } = useTheme();
  const jots = useQuery({ queryKey: ['jots'], queryFn: () => repository.jots.getAll() });
  const links = useQuery({ queryKey: ['links'], queryFn: () => repository.links.getAll() });
  const notes = useQuery({ queryKey: ['notes'], queryFn: () => repository.notes.getAll() });
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: () => repository.tasks.getAll() });
  const spaces = useQuery({ queryKey: ['spaces'], queryFn: () => repository.spaces.getAll() });
  const linkRows = useQuery({ queryKey: ['space-links', 'membership'], queryFn: () => repository.spaceLinks.listMembership() });
  const noteRows = useQuery({ queryKey: ['space-notes', 'membership'], queryFn: () => repository.spaceNotes.listMembership() });
  const taskRows = useQuery({ queryKey: ['space-tasks', 'membership'], queryFn: () => repository.spaceTasks.listMembership() });
  const all = [jots, links, notes, tasks, spaces, linkRows, noteRows, taskRows];
  const [refreshing, setRefreshing] = useState(false);

  const isLoading = all.some((q) => q.isPending);
  const error = all.find((q) => q.error)?.error ?? null;

  const journal = useMemo(() => {
    if (isLoading) return null;
    return toJournal(
      {
        jots: jots.data ?? [],
        links: links.data ?? [],
        notes: notes.data ?? [],
        tasks: tasks.data ?? [],
        spaces: spaces.data ?? [],
        membership: { links: linkRows.data ?? [], notes: noteRows.data ?? [], tasks: taskRows.data ?? [] },
      },
      palette.spaceFallback,
    );
  }, [isLoading, jots.data, links.data, notes.data, tasks.data, spaces.data, linkRows.data, noteRows.data, taskRows.data, palette.spaceFallback]);

  const refetchers = all.map((q) => q.refetch);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all(refetchers.map((refetch) => refetch()));
    } finally {
      setRefreshing(false);
    }
    // refetch functions are stable per query
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { journal, isLoading, error, refreshing, refresh };
};
