import { Navigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useJournal } from '../hooks/useJournal';
import { useFeedbackToast } from '../hooks/useFeedbackToast';
import JournalFeed from '../components/journal/JournalFeed';
import { FeedbackToast } from '../components/ui';
import LoadErrorState from '../components/LoadErrorState';
import { INBOX_PARAM, INBOX_PATH } from '../constants/modules';
import { EmptySlot } from '../components/cards/Controls';
import '../styles/journal.css';

/*
 * The Journal, memex's home (ROADMAP.md Phase 1; decisions 11D, 12B, 13B;
 * Memory Cards d23, x04). Everything you write, save and do, in one
 * chronological feed that reads like a chat: newest at the bottom, composer
 * below (components/journal/JournalFeed, shared with space pages), on one
 * paper column under a “Today” hero. The Inbox is its own page (/inbox);
 * an old `/?inbox=1` link goes there.
 */

const JournalPage = () => {
  const [searchParams] = useSearchParams();
  const { isLoading, loadState, refetch, spaces, entries, filer } = useJournal();
  const { toast, flash, dismiss, handleAnimationEnd } = useFeedbackToast();

  if (searchParams.get(INBOX_PARAM) === '1') return <Navigate to={INBOX_PATH} replace />;

  const today = new Date().toDateString();
  const todayCount = entries.filter((e) => new Date(e.at).toDateString() === today).length;

  return (
    <div className="mc-jr-page">
      <div className="mc-jr-paper">
        <h1 className="mc-hero mc-jr-hero">
          Today
          {loadState === 'ready' && (
            <sup>
              <span className="mc-sr-only">, </span>
              {todayCount}
              <span className="mc-sr-only"> {todayCount === 1 ? 'entry' : 'entries'}</span>
            </sup>
          )}
        </h1>
        <JournalFeed
          entries={entries}
          spaces={spaces}
          filer={filer}
          isLoading={isLoading}
          label="Journal"
          flash={flash}
          dismiss={dismiss}
          failure={loadState === 'failed' ? <LoadErrorState what="your Journal" onRetry={refetch} /> : undefined}
          empty={
            <EmptySlot
              title="Your Journal starts here"
              body="Write what’s on your mind, or paste a link."
              glyph={<Plus />}
              color="var(--mc-blue)"
            />
          }
        />
      </div>
      {toast !== null && (
        <FeedbackToast message={toast.message} phase={toast.phase} action={toast.action} onAnimationEnd={handleAnimationEnd} />
      )}
    </div>
  );
};

export default JournalPage;
