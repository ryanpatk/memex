import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import type { Repository } from '@memex/core';
import type { PageMetadata } from '@memex/core/capture';
import { useToast } from '../ui/Toast';
import { createJournalActions, parseEntryId, type JournalActions } from './actions';
import { createDeleteQueue, type DeleteQueue } from './deleteQueue';

/*
 * The app's data context: the Repository every hook reads through, the
 * Journal's write actions over the React Query cache, and the delete queue
 * behind Undo. Tests mount it with the demo repository.
 */

interface DataContextValue {
  repository: Repository;
  actions: JournalActions;
  deletes: DeleteQueue;
}

const DataContext = createContext<DataContextValue | null>(null);

export const DataProvider = ({
  repository,
  client,
  enrich,
  children,
}: {
  repository: Repository;
  client: string;
  enrich?: (url: string) => Promise<PageMetadata>;
  children: ReactNode;
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();

  const value = useMemo(() => {
    const actions = createJournalActions({ queryClient, repository, client, enrich });
    const deletes = createDeleteQueue({
      commit: (key) => {
        const { kind, id } = parseEntryId(key);
        return actions.remove(kind, id);
      },
      onError: (_key, error) => {
        console.warn('Delete failed:', error);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        toast.show('Couldn’t delete that. It’s back.', { tone: 'error' });
      },
    });
    return { repository, actions, deletes };
  }, [client, enrich, queryClient, repository, toast]);

  // Pending deletes run before the app can be suspended or killed.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') value.deletes.flush();
    });
    return () => sub.remove();
  }, [value]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

const useData = () => {
  const value = useContext(DataContext);
  if (!value) throw new Error('This needs <DataProvider>');
  return value;
};

export const useRepository = () => useData().repository;
export const useActions = () => useData().actions;
export const useDeleteQueue = () => useData().deletes;

/** Entry ids (`link:abc`) waiting out their Undo window or being deleted. */
export const useHiddenEntries = () => {
  const deletes = useDeleteQueue();
  return useSyncExternalStore(deletes.subscribe, deletes.hidden);
};
