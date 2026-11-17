import type { ProposalTarget } from '@memex/core/agent';
import { getLinkTitle, type Entry, type InboxProposal } from '@memex/core';

/** The proposal's target, from the Journal's entries (keys are `type:id`). */
export const proposalTarget = (proposal: InboxProposal, byKey: Map<string, Entry>): ProposalTarget | null => {
  const entry = byKey.get(`${proposal.item_type}:${proposal.item_id}`);
  if (!entry) return null;
  if (entry.kind === 'link') return { type: 'link', item: entry.link };
  if (entry.kind === 'note') return { type: 'note', item: entry.note };
  if (entry.kind === 'task') return { type: 'task', item: entry.task };
  return null;
};

const relFmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** “3 hours ago” for a proposal's time. */
export const ago = (at: string) => {
  const minutes = Math.round((Date.parse(at) - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relFmt.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relFmt.format(hours, 'hour');
  return relFmt.format(Math.round(hours / 24), 'day');
};

/** The proposal target's title. */
export const targetTitle = (target: ProposalTarget) =>
  target.type === 'link' ? getLinkTitle(target.item) : target.type === 'note' ? target.item.title || 'Untitled note' : target.item.title;

