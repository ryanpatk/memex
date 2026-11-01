import { useMemo } from 'react';
import { useAllLinks } from './useLinks';
import { useAllNotes } from './useNotes';
import { useAllTasks } from './useTasks';
import { useProfiles } from './useProfiles';
import { useAllSelfMessages } from './useSelfMessages';
import { useProfileLinkMembership } from './useProfileLinks';
import { useProfileNoteMembership } from './useProfileNotes';
import { useProfileTaskMembership } from './useProfileTasks';
import { useSpaceColors } from './useSpaceColors';
import { buildEntries, createFiler, inboxOf, toJournalSpaces } from '@memex/core';

/**
 * The Journal's data: every entry (jots + links + notes + tasks, oldest
 * first), the spaces, the filing suggester and the Inbox. Reads only; the
 * page owns the writes. Shared by the Journal page and the sidebar's Inbox
 * count (React Query dedupes the fetches).
 */
export const useJournal = () => {
  const links = useAllLinks();
  const notes = useAllNotes();
  const tasks = useAllTasks();
  const jots = useAllSelfMessages();
  const { data: profiles } = useProfiles();
  const { data: linkRows } = useProfileLinkMembership();
  const { data: noteRows } = useProfileNoteMembership();
  const { data: taskRows } = useProfileTaskMembership();
  const colors = useSpaceColors();

  const isLoading = links.isLoading || notes.isLoading || tasks.isLoading || jots.isLoading;

  return useMemo(() => {
    const spaces = toJournalSpaces(profiles ?? [], colors);
    const entries = buildEntries({
      jots: jots.data ?? [],
      links: links.data ?? [],
      notes: notes.data ?? [],
      tasks: tasks.data ?? [],
      spaces,
      membership: { links: linkRows ?? [], notes: noteRows ?? [], tasks: taskRows ?? [] },
    });
    const filer = createFiler(entries, spaces);
    const inbox = inboxOf(entries, filer);
    return { isLoading, spaces, entries, filer, inbox };
  }, [colors, isLoading, jots.data, linkRows, links.data, noteRows, notes.data, profiles, taskRows, tasks.data]);
};
