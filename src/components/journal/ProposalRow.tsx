import { useState, type CSSProperties } from 'react';
import { Bot, Check, X } from 'lucide-react';
import { changedSinceProposed, compactDiff, proposalFields, type ProposalTarget } from '@memex/core/agent';
import { getLinkTitle, type InboxProposal, type JournalSpace } from '@memex/core';

/*
 * One agent proposal in the Inbox tray (docs/mcp.md → "Proposals"): which
 * agent, what it wants to change, a diff against the item as it is now, and
 * Approve / Reject. Nothing changes until Approve; Reject keeps the record.
 */

const timeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const relFmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const ago = (at: string) => {
  const minutes = Math.round((Date.parse(at) - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relFmt.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relFmt.format(hours, 'hour');
  return relFmt.format(Math.round(hours / 24), 'day');
};

const targetTitle = (target: ProposalTarget) =>
  target.type === 'link' ? getLinkTitle(target.item) : target.type === 'note' ? target.item.title || 'Untitled note' : target.item.title;

const TYPE_WORD = { link: 'link', note: 'note', task: 'task' } as const;
const DIFF_LINES = 14;

const Diff = ({ lines }: { lines: ReturnType<typeof compactDiff> }) => {
  const [all, setAll] = useState(false);
  const shown = all ? lines : lines.slice(0, DIFF_LINES);
  return (
    <>
      <pre className="jr-diff" aria-label="Changes to the text">
        {shown.map((line, i) =>
          line.op === 'skip' ? (
            <span key={i} className="jr-diff-skip">
              {`⋯ ${line.count} unchanged ${line.count === 1 ? 'line' : 'lines'}`}
            </span>
          ) : (
            <span key={i} className={`jr-diff-line is-${line.op}`}>
              <span className="jr-diff-mark" aria-hidden="true">
                {line.op === 'add' ? '+' : line.op === 'del' ? '−' : ' '}
              </span>
              <span className="jr-sr">{line.op === 'add' ? 'Added: ' : line.op === 'del' ? 'Removed: ' : ''}</span>
              {line.text || ' '}
            </span>
          ),
        )}
      </pre>
      {lines.length > DIFF_LINES && (
        <button type="button" className="jr-more" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? 'Show less' : `Show all ${lines.length} lines`}
        </button>
      )}
    </>
  );
};

export const ProposalRow = ({
  proposal,
  target,
  space,
  busy,
  onDecide,
}: {
  proposal: InboxProposal;
  target: ProposalTarget | null;
  space: JournalSpace | undefined;
  busy: 'apply' | 'reject' | null;
  onDecide: (decision: 'apply' | 'reject') => void;
}) => {
  const title = target ? targetTitle(target) : null;
  const fields = target ? proposalFields(proposal, target) : [];
  const stale = target ? changedSinceProposed(proposal, target) : false;
  const what =
    proposal.kind === 'file'
      ? `File this ${TYPE_WORD[proposal.item_type]} in`
      : proposal.kind === 'append'
        ? 'Add to the end of this note'
        : `Edit this ${TYPE_WORD[proposal.item_type]}`;

  return (
    <li className="jr-inbox-row jr-proposal" aria-busy={busy !== null}>
      <span className="jr-proposal-who">
        <Bot aria-hidden="true" />
        <span className="jr-ellipsis" translate="no">
          {proposal.client_name}
        </span>
        <time className="jr-push" dateTime={proposal.created_at} title={timeFmt.format(new Date(proposal.created_at))}>
          {ago(proposal.created_at)}
        </time>
      </span>
      <span className="jr-proposal-what">
        {what}
        {proposal.kind === 'file' &&
          (space ? (
            <span className="jr-chip" style={{ '--hue': space.color } as CSSProperties}>
              <i className="jr-dot" aria-hidden="true" />
              <span className="jr-ellipsis">{space.name}</span>
            </span>
          ) : (
            ' a space that no longer exists'
          ))}
      </span>
      {title !== null ? <span className="jr-inbox-title">{title}</span> : <span className="jr-inbox-reason">This item no longer exists.</span>}
      {proposal.reason && <span className="jr-inbox-reason">“{proposal.reason}”</span>}
      {stale && <span className="jr-proposal-stale">Edited since this was proposed; the diff shows today’s text.</span>}
      {fields.map((f) =>
        f.field === 'text' ? (
          <div key={f.field} className="jr-proposal-field">
            <span className="jr-proposal-label">{f.label}</span>
            <Diff lines={compactDiff(f.lines)} />
          </div>
        ) : (
          <div key={f.field} className="jr-proposal-field">
            <span className="jr-proposal-label">{f.label}</span>
            <span className="jr-proposal-change">
              <del>{f.before || 'empty'}</del>
              <span aria-hidden="true"> → </span>
              <span className="jr-sr"> becomes </span>
              <ins>{f.after || 'empty'}</ins>
            </span>
          </div>
        ),
      )}
      <span className="jr-proposal-actions">
        <button
          type="button"
          className="btn-primary btn-compact"
          disabled={busy !== null || !target || (proposal.kind === 'file' && !space)}
          onClick={() => onDecide('apply')}
        >
          {busy === 'apply' ? <span className="jr-spinner" aria-hidden="true" /> : <Check aria-hidden="true" />}
          Approve
        </button>
        <button type="button" className="btn-secondary btn-compact" disabled={busy !== null} onClick={() => onDecide('reject')}>
          {busy === 'reject' ? <span className="jr-spinner" aria-hidden="true" /> : <X aria-hidden="true" />}
          Reject
        </button>
      </span>
    </li>
  );
};
