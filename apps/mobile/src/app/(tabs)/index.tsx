import { useCallback, useEffect, useRef } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { parseComposer, type Part } from '@memex/core';
import { FIXTURE_MODE } from '../../data/config';
import { useJournal } from '../../data/useJournal';
import { Composer } from '../../journal/Composer';
import { JournalFeed } from '../../journal/JournalFeed';
import { useEntryActions } from '../../journal/useEntryActions';
import { AccountButton } from '../../ui/AccountButton';
import { Canvas } from '../../ui/Canvas';
import { FeedEmpty, FeedError, FeedSkeleton } from '../../ui/FeedStates';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { useToast } from '../../ui/Toast';

const countFmt = new Intl.NumberFormat();

/** Entries above the first day separator of a newest-first feed, if that day is today. */
const countToday = (feed: Part[]) => {
  const sep = feed.findIndex((p) => p.kind === 'day');
  const first = feed[sep];
  if (!first || first.kind !== 'day' || first.label !== 'Today') return 0;
  return feed.slice(0, sep).reduce((n, p) => n + (p.kind === 'run' ? p.entries.length : 1), 0);
};

/**
 * Journal (home): every jot, link, note and task, newest at the bottom, with
 * the composer above the tab bar (decision 16A). `memex:///?draft=…` opens
 * it with text in the composer (nothing is saved until you send).
 */
export default function JournalScreen() {
  const { journal, isLoading, error, refreshing, refresh } = useJournal();
  const actions = useEntryActions();
  const toast = useToast();
  const { height } = useWindowDimensions();
  const params = useLocalSearchParams<{ draft?: string; send?: string }>();
  const composerTop = useRef(height);
  const today = journal ? countToday(journal.feed) : 0;
  const subtitle = journal
    ? `${countFmt.format(journal.entries.length)} entries${today ? ` · ${today} today` : ''}`
    : undefined;

  // Toasts sit just above the composer, wherever the keyboard has put it.
  const placeToasts = useCallback((y: number) => {
    composerTop.current = y;
    toast.setInset(Math.max(height - y + 8, 16));
  }, [height, toast]);
  useFocusEffect(
    useCallback(() => {
      placeToasts(composerTop.current);
      return () => toast.setInset(96);
    }, [placeToasts, toast]),
  );

  // DEV-ONLY, demo data only: `?draft=…&send=1` sends the draft, so the
  // simulator (which can't be tapped from scripts) can prove the save path.
  const sentDraft = useRef<string | null>(null);
  useEffect(() => {
    if (!__DEV__ || FIXTURE_MODE === 'off' || params.send !== '1' || !params.draft || !journal) return;
    if (sentDraft.current === params.draft) return;
    sentDraft.current = params.draft;
    const result = parseComposer(params.draft, journal.spaces);
    if (result.kind !== 'empty') void actions.compose(result).catch(() => {});
  }, [actions, journal, params.draft, params.send]);

  const draft = params.send === '1' ? undefined : params.draft;

  return (
    <Canvas>
      <ScreenHeader title="Journal" subtitle={subtitle} trailing={<AccountButton />} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        {isLoading ? (
          <FeedSkeleton />
        ) : error && !journal?.entries.length ? (
          <FeedError error={error} onRetry={refresh} />
        ) : !journal?.entries.length ? (
          <FeedEmpty />
        ) : (
          <JournalFeed parts={journal.feed} spaces={journal.spaces} filer={journal.filer} refreshing={refreshing} onRefresh={refresh} />
        )}
        {!isLoading && !(error && !journal) && (
          <Composer spaces={journal?.spaces ?? []} filer={journal?.filer} onSubmit={actions.compose} draft={draft} onTop={placeToasts} />
        )}
      </KeyboardAvoidingView>
    </Canvas>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
