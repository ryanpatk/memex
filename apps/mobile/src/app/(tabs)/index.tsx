import type { Part } from '@memex/core';
import { useJournal } from '../../data/useJournal';
import { JournalFeed } from '../../journal/JournalFeed';
import { AccountButton } from '../../ui/AccountButton';
import { Canvas } from '../../ui/Canvas';
import { FeedEmpty, FeedError, FeedSkeleton } from '../../ui/FeedStates';
import { ScreenHeader } from '../../ui/ScreenHeader';

const countFmt = new Intl.NumberFormat();

/** Entries above the first day separator of a newest-first feed, if that day is today. */
const countToday = (feed: Part[]) => {
  const sep = feed.findIndex((p) => p.kind === 'day');
  const first = feed[sep];
  if (!first || first.kind !== 'day' || first.label !== 'Today') return 0;
  return feed.slice(0, sep).reduce((n, p) => n + (p.kind === 'run' ? p.entries.length : 1), 0);
};

/** Journal (home): every jot, link, note and task, newest at the bottom. Read-only for now. */
export default function JournalScreen() {
  const { journal, isLoading, error, refreshing, refresh } = useJournal();
  const today = journal ? countToday(journal.feed) : 0;
  const subtitle = journal
    ? `${countFmt.format(journal.entries.length)} entries${today ? ` · ${today} today` : ''}`
    : undefined;

  return (
    <Canvas>
      <ScreenHeader title="Journal" subtitle={subtitle} trailing={<AccountButton />} />
      {isLoading ? (
        <FeedSkeleton />
      ) : error && !journal?.entries.length ? (
        <FeedError error={error} onRetry={refresh} />
      ) : !journal?.entries.length ? (
        <FeedEmpty />
      ) : (
        <JournalFeed parts={journal.feed} refreshing={refreshing} onRefresh={refresh} />
      )}
    </Canvas>
  );
}
