import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../theme/theme';
import { useHiddenEntries, useRepository } from './DataProvider';
import { toJournal } from './journal';
import { keys } from './keys';

/*
 * React Query over the Repository for the Journal. One query per resource
 * (keys.ts), so a shared @memex/react package can take these over later.
 * Every tab reads this; React Query dedupes the fetches. Entries waiting out
 * their Undo window are left out.
 */

export const useJournal = () => {
  const { palette } = useTheme();
  const repository = useRepository();
  const hidden = useHiddenEntries();
  const jots = useQuery({ queryKey: keys.jots, queryFn: () => repository.jots.getAll() });
  const links = useQuery({ queryKey: keys.links, queryFn: () => repository.links.getAll() });
  const notes = useQuery({ queryKey: keys.notes, queryFn: () => repository.notes.getAll() });
  const tasks = useQuery({ queryKey: keys.tasks, queryFn: () => repository.tasks.getAll() });
  const spaces = useQuery({ queryKey: keys.spaces, queryFn: () => repository.spaces.getAll() });
  const linkRows = useQuery({ queryKey: keys.linkMembership, queryFn: () => repository.spaceLinks.listMembership() });
  const noteRows = useQuery({ queryKey: keys.noteMembership, queryFn: () => repository.spaceNotes.listMembership() });
  const taskRows = useQuery({ queryKey: keys.taskMembership, queryFn: () => repository.spaceTasks.listMembership() });
  const all = [jots, links, notes, tasks, spaces, linkRows, noteRows, taskRows];
  const [refreshing, setRefreshing] = useState(false);

  const isLoading = all.some((q) => q.isPending);
  const error = all.find((q) => q.error)?.error ?? null;

  const journal = useMemo(() => {
    if (isLoading) return null;
    const shown = <T extends { id: string }>(kind: string, rows: T[] | undefined) =>
      hidden.size ? (rows ?? []).filter((r) => !hidden.has(`${kind}:${r.id}`)) : (rows ?? []);
    return toJournal(
      {
        jots: shown('jot', jots.data),
        links: shown('link', links.data),
        notes: shown('note', notes.data),
        tasks: shown('task', tasks.data),
        spaces: spaces.data ?? [],
        membership: { links: linkRows.data ?? [], notes: noteRows.data ?? [], tasks: taskRows.data ?? [] },
      },
      palette.spaceFallback,
    );
  }, [isLoading, hidden, jots.data, links.data, notes.data, tasks.data, spaces.data, linkRows.data, noteRows.data, taskRows.data, palette.spaceFallback]);

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
