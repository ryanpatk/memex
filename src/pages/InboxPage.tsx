import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { Check, FileText, Square } from 'lucide-react';
import { changedSinceProposed, compactDiff, proposalFields, type ProposalTarget } from '@memex/core/agent';
import { getHostname, type Entry, type FileableEntry, type InboxProposal, type JournalSpace, type Suggestion, getLinkTitle } from '@memex/core';
import { useJournal } from '../hooks/useJournal';
import { useAddToSpace } from '../hooks/useAddToSpace';
import { useFeedbackToast } from '../hooks/useFeedbackToast';
import { useDecideProposal } from '../hooks/useProposals';
import { ago, proposalTarget, targetTitle } from '../components/journal/proposalTarget';
import { AgentBadge } from '../components/cards/MemoryCard';
import LabelStrip from '../components/cards/LabelStrip';
import { EmptySlot } from '../components/cards/Controls';
import { linkLabelMeta } from '../components/cards/cardMeta';
import { entryLabel } from '../components/cards/journal/entryLabel';
import { useNotNow } from '../components/cards/journal/notNow';
import { FeedbackToast } from '../components/ui';
import LoadErrorState from '../components/LoadErrorState';
import { HANDLES_ERRORS } from '../utils/mutationErrors';
import { cue } from '../utils/sound';

/*
 * The Inbox as its own page (Memory Cards d25/d26). Two columns: what agents
 * asked to change (approve or reject; nothing changes until Approve), and
 * recent saves with a likely space (one press files, with Undo). “Not now”
 * puts a suggestion away for this browser session; the save stays unfiled,
 * which is a fine place to be. Same data and writes as the classic Journal's
 * Inbox tray (hooks/useJournal, hooks/useProposals, hooks/useAddToSpace).
 */

const timeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const KIND_WORD = { link: 'link', note: 'note', task: 'task' } as const;

const titleOf = (entry: FileableEntry) =>
  entry.kind === 'link' ? getLinkTitle(entry.link) : entry.kind === 'note' ? entry.note.title || 'Untitled' : entry.task.title;

const InboxPage = () => {
  const { isLoading, loadState, refetch, spaces, entries, inbox, proposals } = useJournal();
  const { toast, flash, handleAnimationEnd } = useFeedbackToast();
  const addToSpace = useAddToSpace(flash);
  const decideProposal = useDecideProposal(HANDLES_ERRORS);
  const [deciding, setDeciding] = useState<{ id: string; decision: 'apply' | 'reject' } | null>(null);
  const { notNow, putAway: hide, bringBack } = useNotNow();
  const entriesByKey = useMemo(() => new Map<string, Entry>(entries.map((e) => [e.id, e])), [entries]);

  const toFile = useMemo(() => inbox.filter(({ entry }) => !notNow.has(entry.id)), [inbox, notNow]);
  const count = proposals.length + toFile.length;

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

  const putAway = useCallback(
    (entry: FileableEntry) => {
      cue('dismiss');
      hide(entry.id);
      flash(`Left “${titleOf(entry)}” unfiled.`, { label: 'Undo', onClick: () => bringBack(entry.id) });
    },
    [bringBack, flash, hide],
  );

  const ready = !isLoading && loadState !== 'failed';

  return (
    <main className="mc-page mc-inbox-page" aria-labelledby="mc-inbox-title">
      <div className="mc-page-head">
        <h1 className="mc-hero" id="mc-inbox-title">
          Inbox
          {ready && (
            <sup>
              <span className="mc-sr-only">, </span>
              {count}
              <span className="mc-sr-only"> waiting</span>
            </sup>
          )}
        </h1>
      </div>

      {loadState === 'failed' ? (
        <LoadErrorState what="your Inbox" onRetry={refetch} />
      ) : isLoading ? (
        <div className="mc-inbox-grid" aria-busy="true" aria-label="Loading the Inbox">
          <div className="mc-inbox-col">
            <span className="mc-sk" style={{ height: 320, borderRadius: 28 }} />
          </div>
          <div className="mc-inbox-col">
            <span className="mc-sk" style={{ height: 240, borderRadius: 28 }} />
            <span className="mc-sk" style={{ height: 240, borderRadius: 28 }} />
          </div>
        </div>
      ) : count === 0 ? (
        <div className="mc-inbox-empty">
          <EmptySlot
            title="Everything is filed"
            body="Agents’ proposals and filing ideas land here."
            glyph={<Check />}
            color="var(--mc-green)"
          />
        </div>
      ) : (
        <div className={`mc-inbox-grid${proposals.length === 0 || toFile.length === 0 ? ' is-single' : ''}`}>
          {proposals.length > 0 && (
            <section className="mc-inbox-col" aria-labelledby="mc-inbox-agents">
              <h2 className="mc-sec" id="mc-inbox-agents">
                From agents
              </h2>
              {proposals.map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  target={proposalTarget(proposal, entriesByKey)}
                  entry={entriesByKey.get(`${proposal.item_type}:${proposal.item_id}`)}
                  space={spaces.find((s) => s.id === proposal.space_id)}
                  busy={deciding?.id === proposal.id ? deciding.decision : null}
                  onDecide={(decision) => void handleDecide(proposal, decision)}
                />
              ))}
            </section>
          )}
          {toFile.length > 0 && (
            <section className="mc-inbox-col" aria-labelledby="mc-inbox-file">
              <h2 className="mc-sec" id="mc-inbox-file">
                To file
              </h2>
              {toFile.map(({ entry, suggestion }) => (
                <SuggestionCard
                  key={entry.id}
                  entry={entry}
                  suggestion={suggestion}
                  onFile={() => void addToSpace(suggestion.space.id, [entry.id])}
                  onNotNow={() => putAway(entry)}
                />
              ))}
            </section>
          )}
        </div>
      )}

      {toast !== null && (
        <FeedbackToast message={toast.message} phase={toast.phase} action={toast.action} onAnimationEnd={handleAnimationEnd} />
      )}
    </main>
  );
};

/* ---------- From agents (s10) ---------- */

const ProposalCard = ({
  proposal,
  target,
  entry,
  space,
  busy,
  onDecide,
}: {
  proposal: InboxProposal;
  target: ProposalTarget | null;
  entry: Entry | undefined;
  space: JournalSpace | undefined;
  busy: 'apply' | 'reject' | null;
  onDecide: (decision: 'apply' | 'reject') => void;
}) => {
  const title = target ? targetTitle(target) : null;
  const fields = target ? proposalFields(proposal, target) : [];
  const stale = target ? changedSinceProposed(proposal, target) : false;
  const what = proposal.kind === 'file' ? 'wants to file' : proposal.kind === 'append' ? 'wants to add to' : 'wants to edit';
  // The label names where the change lands: the space it files into, or the item's own space
  const label =
    proposal.kind === 'file'
      ? space
        ? { name: space.name, color: space.color, extra: 0 }
        : { name: null, color: null, extra: 0 }
      : entryLabel(entry && entry.kind !== 'jot' ? entry.spaces : []);

  return (
    <article className="mc-card mc-inbox-card mc-proposal" aria-busy={busy !== null} style={label.color ? ({ '--c': label.color } as CSSProperties) : undefined}>
      <div className="mc-inbox-who">
        <AgentBadge name={proposal.client_name} />
        <span className="mc-lab">
          {what} ·{' '}
          <time dateTime={proposal.created_at} title={timeFmt.format(new Date(proposal.created_at))}>
            {ago(proposal.created_at)}
          </time>
        </span>
      </div>
      {title !== null ? <h3 className="mc-h3 mc-inbox-title">{title}</h3> : <p className="mc-body mc-inbox-gone">This item no longer exists.</p>}
      {proposal.kind === 'file' && (
        <p className="mc-lab mc-inbox-line">
          File in <strong translate="no">{space ? space.name : 'a space that no longer exists'}</strong>
        </p>
      )}
      {fields.map((f) =>
        f.field === 'text' ? (
          <pre key={f.field} className="mc-diff mc-inbox-diff" aria-label={`${f.label}: changes`}>
            {compactDiff(f.lines).map((line, i) =>
              line.op === 'skip' ? (
                <span key={i} className="mc-diff-line mc-diff-skip">{`⋯ ${line.count} unchanged ${line.count === 1 ? 'line' : 'lines'}`}</span>
              ) : (
                <span key={i} className={`mc-diff-line${line.op === 'add' ? ' is-ins' : line.op === 'del' ? ' is-del' : ''}`}>
                  <span className="mc-sr-only">{line.op === 'add' ? 'Added: ' : line.op === 'del' ? 'Removed: ' : ''}</span>
                  {line.text || '\u00a0'}
                </span>
              ),
            )}
          </pre>
        ) : (
          <div key={f.field} className="mc-diff mc-inbox-diff">
            <span className="mc-lab">{f.label}: </span>
            <del>{f.before || 'empty'}</del>
            <span aria-hidden="true"> → </span>
            <span className="mc-sr-only"> becomes </span>
            <ins>{f.after || 'empty'}</ins>
          </div>
        ),
      )}
      {proposal.reason && <p className="mc-lab mc-inbox-line">{proposal.reason}</p>}
      {stale && <p className="mc-lab mc-inbox-line">Edited since this was proposed; the diff shows today’s text.</p>}
      <div className="mc-inbox-actions">
        <button
          type="button"
          className="mc-btn is-primary"
          aria-busy={busy === 'apply'}
          disabled={busy !== null || !target || (proposal.kind === 'file' && !space)}
          onClick={() => onDecide('apply')}
        >
          Approve
        </button>
        <button type="button" className="mc-btn is-quiet" aria-busy={busy === 'reject'} disabled={busy !== null} onClick={() => onDecide('reject')}>
          Reject
        </button>
      </div>
      <LabelStrip label={label} meta={KIND_WORD[proposal.item_type]} />
    </article>
  );
};

/* ---------- To file (s10) ---------- */

const Thumb = ({ entry }: { entry: FileableEntry }) => {
  const [failed, setFailed] = useState(false);
  if (entry.kind === 'link' && entry.link.preview_image_url && !failed) {
    return (
      <span className="mc-inbox-thumb">
        <img src={entry.link.preview_image_url} alt="" decoding="async" onError={() => setFailed(true)} />
      </span>
    );
  }
  return (
    <span className="mc-inbox-thumb is-glyph" aria-hidden="true">
      {entry.kind === 'link' ? getHostname(entry.link.url).replace(/^www\./, '').slice(0, 1).toUpperCase() : entry.kind === 'note' ? <FileText /> : <Square />}
    </span>
  );
};

const SuggestionCard = ({
  entry,
  suggestion,
  onFile,
  onNotNow,
}: {
  entry: FileableEntry;
  suggestion: Suggestion;
  onFile: () => void;
  onNotNow: () => void;
}) => {
  const title = titleOf(entry);
  const meta = entry.kind === 'link' ? linkLabelMeta(entry.link) : KIND_WORD[entry.kind];
  return (
    <article className="mc-card mc-inbox-card mc-suggestion">
      <div className="mc-inbox-row">
        <Thumb entry={entry} />
        <div className="mc-inbox-text">
          <h3 className="mc-h3 mc-inbox-title">{title}</h3>
          <p className="mc-lab">{suggestion.reason}</p>
        </div>
      </div>
      <div className="mc-inbox-actions">
        <button
          type="button"
          className="mc-pill is-selected is-small mc-inbox-file"
          style={{ '--c': suggestion.space.color } as CSSProperties}
          aria-label={`File “${title}” in ${suggestion.space.name}`}
          onClick={onFile}
        >
          <span className="mc-pill-dot" aria-hidden="true">
            <Check />
          </span>
          <span className="mc-pill-name">
            File in <span translate="no">{suggestion.space.name}</span>
          </span>
        </button>
        <button type="button" className="mc-btn is-quiet is-small" onClick={onNotNow} aria-label={`Not now: leave “${title}” unfiled`}>
          Not now
        </button>
      </div>
      <LabelStrip label={{ name: null, color: null, extra: 0 }} meta={meta} />
    </article>
  );
};

export default InboxPage;
