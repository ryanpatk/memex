import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { AppState } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import type { OutboxItem, OutboxStorage, Repository } from '@memex/core';
import type { PageMetadata } from '@memex/core/capture';
import { useToast } from '../ui/Toast';
import { createJournalActions, parseEntryId, type JournalActions } from './actions';
import { createDeleteQueue, type DeleteQueue } from './deleteQueue';
import { createDismissals, type DismissalStorage, type Dismissals } from './dismissals';
import { createSaves, type Saves } from './saves';

/*
 * The app's data context: the Repository every hook reads through, the
 * Journal's write actions over the React Query cache, the saves (with the
 * outbox for when the phone is offline), the delete queue behind Undo, and
 * the suggestions dismissed on this phone. Tests mount it with the demo
 * repository (and no storage, so dismissals and the outbox stay in memory).
 */

interface DataContextValue {
  repository: Repository;
  actions: JournalActions;
  saves: Saves;
  deletes: DeleteQueue;
  dismissals: Dismissals;
}

const DataContext = createContext<DataContextValue | null>(null);

export const DataProvider = ({
  repository,
  client,
  enrich,
  dismissalStorage,
  outboxStorage,
  newId = Crypto.randomUUID,
  children,
}: {
  repository: Repository;
  client: string;
  enrich?: (url: string) => Promise<PageMetadata>;
  /** Where dismissed suggestions persist (AsyncStorage in the app). */
  dismissalStorage?: DismissalStorage;
  /** Where saves waiting for a connection persist (encrypted storage in the app). */
  outboxStorage?: OutboxStorage;
  /** Ids for new jots, notes and tasks (a UUID; tests pass their own). */
  newId?: () => string;
  children: ReactNode;
}) => {
  const queryClient = useQueryClient();
  const toast = useToast();

  const value = useMemo(() => {
    const actions = createJournalActions({ queryClient, repository, client, enrich });
    const saves = createSaves({
      actions,
      newId,
      storage: outboxStorage,
      onStorageError: (error) => console.warn('Couldn’t store the outbox:', error),
    });
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
    return { repository, actions, saves, deletes };
  }, [client, enrich, newId, outboxStorage, queryClient, repository, toast]);

  const dismissals = useMemo(() => createDismissals({ storage: dismissalStorage }), [dismissalStorage]);
  useEffect(() => {
    void dismissals.load();
  }, [dismissals]);

  // Pending deletes run before the app can be suspended or killed.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') value.deletes.flush();
    });
    return () => sub.remove();
  }, [value]);

  const context = useMemo(() => ({ ...value, dismissals }), [value, dismissals]);
  return <DataContext.Provider value={context}>{children}</DataContext.Provider>;
};

const useData = () => {
  const value = useContext(DataContext);
  if (!value) throw new Error('This needs <DataProvider>');
  return value;
};

export const useRepository = () => useData().repository;
export const useActions = () => useData().actions;
export const useSaves = () => useData().saves;

/** The signed-in user the outbox sends for (set by useOutboxSync). */
export const useOutboxOwner = () => {
  const saves = useSaves();
  return useSyncExternalStore(saves.subscribeOwner, saves.owner);
};

/** Saves waiting on this phone for a connection (or a retry), oldest first. */
export const useOutboxItems = (): readonly OutboxItem[] => {
  const { outbox } = useSaves();
  return useSyncExternalStore(outbox.subscribe, outbox.items);
};
export const useDeleteQueue = () => useData().deletes;

/** Entry ids (`link:abc`) waiting out their Undo window or being deleted. */
export const useHiddenEntries = () => {
  const deletes = useDeleteQueue();
  return useSyncExternalStore(deletes.subscribe, deletes.hidden);
};

export const useDismissals = () => useData().dismissals;

/** Entry ids whose filing suggestion was dismissed on this phone. */
export const useDismissed = () => {
  const dismissals = useDismissals();
  return useSyncExternalStore(dismissals.subscribe, dismissals.current);
};
