import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Inbox, X } from 'lucide-react';
import { useJournal } from '../hooks/useJournal';
import { useAddToSpace } from '../hooks/useAddToSpace';
import { useFeedbackToast } from '../hooks/useFeedbackToast';
import { useDecideProposal } from '../hooks/useProposals';
import JournalFeed from '../components/journal/JournalFeed';
import { ProposalRow } from '../components/journal/ProposalRow';
import { proposalTarget } from '../components/journal/proposalTarget';
import { FeedbackToast } from '../components/ui';
import { INBOX_PARAM } from '../constants/modules';
import {
  type Entry,
  type FileableEntry,
  type InboxProposal,
  type Suggestion,
  getHostname,
  getLinkTitle,
} from '@memex/core';
import { cue } from '../utils/sound';
import '../styles/journal.css';

/*
 * The Journal, memex's home (ROADMAP.md Phase 1; decisions 11D, 12B, 13B).
 * Everything you write, save and do, in one chronological feed that reads
 * like a chat: newest at the bottom, composer below (components/journal/
 * JournalFeed, shared with space pages). The Inbox tray opens beside it only
 * when something waits: agents' proposals (approve or reject; docs/mcp.md)
 * and filing suggestions.
 */

const titleOf = (entry: FileableEntry) =>
  entry.kind === 'link' ? getLinkTitle(entry.link) : entry.kind === 'note' ? entry.note.title || 'Untitled' : entry.task.title;

const JournalPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const inboxOpen = searchParams.get(INBOX_PARAM) === '1';
  const { isLoading, spaces, entries, filer, inbox, proposals, inboxCount } = useJournal();
  const { toast, flash, dismiss, handleAnimationEnd } = useFeedbackToast();
  const addToSpace = useAddToSpace(flash);
  const decideProposal = useDecideProposal();
  const [deciding, setDeciding] = useState<{ id: string; decision: 'apply' | 'reject' } | null>(null);
  const entriesByKey = useMemo(() => new Map<string, Entry>(entries.map((e) => [e.id, e])), [entries]);

  const handleFile = useCallback(
    (keys: string[], spaceId: string) => {
      void addToSpace(spaceId, keys);
    },
    [addToSpace],
  );

  const handleDecide = useCallback(
    async (proposal: InboxProposal, decision: 'apply' | 'reject') => {
      setDeciding({ id: proposal.id, decision });
      try {
        await decideProposal.mutateAsync({ proposal, target: proposalTarget(proposal, entriesByKey), decision });
        cue(decision === 'apply' ? 'confirm' : 'dismiss');
        flash(decision === 'apply' ? `Approved ${proposal.client_name}’s change.` : `Rejected ${proposal.client_name}’s proposal.`);
      } catch (error) {
        console.error('Failed to decide a proposal:', error);
        cue('error');
        flash(error instanceof Error && /no longer exists|already decided/.test(error.message) ? error.message : 'Couldn’t do that. Try again.');
      } finally {
        setDeciding(null);
      }
    },
    [decideProposal, entriesByKey, flash],
  );

  const setInboxOpen = (open: boolean) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (open) next.set(INBOX_PARAM, '1');
        else next.delete(INBOX_PARAM);
        return next;
      },
      { replace: true },
    );

  // The tray closes itself once the last suggestion or proposal is handled
  useEffect(() => {
    if (inboxOpen && !isLoading && inboxCount === 0) setInboxOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inboxCount, inboxOpen, isLoading]);

  const today = new Date().toDateString();
  const todayCount = entries.filter((e) => new Date(e.at).toDateString() === today).length;

  return (
    <div className={`jr-page${inboxOpen ? ' has-inbox' : ''}`}>
      <header className="memex-page-header jr-head">
        <div className="memex-page-header-row">
          <div className="memex-page-heading">
            <h1 className="memex-page-title">
              <span className="memex-page-title-text">Journal</span>
            </h1>
            <p className="memex-page-subtitle">{todayCount === 0 ? 'Nothing yet today' : `${todayCount} today`}</p>
          </div>
          {inboxCount > 0 && (
            <div className="memex-page-actions">
              <button
                type="button"
                className={`btn-secondary btn-compact jr-inbox-toggle${inboxOpen ? ' is-open' : ''}`}
                aria-expanded={inboxOpen}
                aria-controls="journal-inbox"
                onClick={() => setInboxOpen(!inboxOpen)}
              >
                <Inbox aria-hidden="true" />
                Inbox
                <span className="jr-count">{inboxCount}</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="jr-body">
        <JournalFeed
          entries={entries}
          spaces={spaces}
          filer={filer}
          isLoading={isLoading}
          label="Journal"
          flash={flash}
          dismiss={dismiss}
          empty={
            <div className="jr-empty">
              <p className="jr-empty-title">Your Journal starts here</p>
              <p>Write what’s on your mind, paste a link, or start a line with “[] ” for a task.</p>
            </div>
          }
        />

        {inboxOpen && inboxCount > 0 && (
          <aside className="jr-inbox" id="journal-inbox" aria-label="Inbox">
            <div className="jr-inbox-head">
              <h2>Inbox</h2>
              <span className="jr-count">{inboxCount}</span>
              <button type="button" className="memex-icon-button is-compact jr-push" aria-label="Close Inbox" onClick={() => setInboxOpen(false)}>
                <X aria-hidden="true" />
              </button>
            </div>
            {proposals.length > 0 && (
              <section aria-labelledby="inbox-agents">
                <h3 className="jr-inbox-section" id="inbox-agents">
                  From agents
                </h3>
                <p className="jr-inbox-lede">Changes an agent asked to make. Nothing changes until you approve; rejected ones are kept as a record.</p>
                <ul className="jr-inbox-list">
                  {proposals.map((proposal) => (
                    <ProposalRow
                      key={proposal.id}
                      proposal={proposal}
                      target={proposalTarget(proposal, entriesByKey)}
                      space={spaces.find((s) => s.id === proposal.space_id)}
                      busy={deciding?.id === proposal.id ? deciding.decision : null}
                      onDecide={(decision) => void handleDecide(proposal, decision)}
                    />
                  ))}
                </ul>
              </section>
            )}
            {inbox.length > 0 && (
              <section aria-labelledby={proposals.length > 0 ? 'inbox-filing' : undefined}>
                {proposals.length > 0 && (
                  <h3 className="jr-inbox-section" id="inbox-filing">
                    Filing suggestions
                  </h3>
                )}
                <p className="jr-inbox-lede">Recent saves with a likely space. One press files each; anything you leave stays fine where it is.</p>
                <ul className="jr-inbox-list">
                  {inbox.map(({ entry, suggestion }) => (
                    <InboxRow key={entry.id} entry={entry} suggestion={suggestion} onFile={handleFile} />
                  ))}
                </ul>
              </section>
            )}
          </aside>
        )}
      </div>

      {toast !== null && (
        <FeedbackToast message={toast.message} phase={toast.phase} action={toast.action} onAnimationEnd={handleAnimationEnd} />
      )}
    </div>
  );
};

const InboxRow = ({ entry, suggestion, onFile }: { entry: FileableEntry; suggestion: Suggestion; onFile: (keys: string[], spaceId: string) => void }) => {
  const sub = entry.kind === 'link' ? getHostname(entry.link.url) : entry.kind === 'note' ? 'Note' : 'Task';
  return (
    <li className="jr-inbox-row">
      <span className="jr-inbox-title">{titleOf(entry)}</span>
      <span className="jr-inbox-sub">{sub}</span>
      <span className="jr-inbox-reason">{suggestion.reason}</span>
      <button
        type="button"
        className="jr-chip is-suggested"
        style={{ '--hue': suggestion.space.color } as CSSProperties}
        aria-label={`File “${titleOf(entry)}” in ${suggestion.space.name}`}
        onClick={() => onFile([entry.id], suggestion.space.id)}
      >
        <i className="jr-dot" aria-hidden="true" />
        <span className="jr-ellipsis">{suggestion.space.name}</span>
        <span className="jr-chip-accept" aria-hidden="true">
          <Check />
        </span>
      </button>
    </li>
  );
};

export default JournalPage;
