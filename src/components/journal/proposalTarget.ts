import type { ProposalTarget } from '@memex/core/agent';
import type { Entry, InboxProposal } from '@memex/core';

/** The proposal's target, from the Journal's entries (keys are `type:id`). */
export const proposalTarget = (proposal: InboxProposal, byKey: Map<string, Entry>): ProposalTarget | null => {
  const entry = byKey.get(`${proposal.item_type}:${proposal.item_id}`);
  if (!entry) return null;
  if (entry.kind === 'link') return { type: 'link', item: entry.link };
  if (entry.kind === 'note') return { type: 'note', item: entry.note };
  if (entry.kind === 'task') return { type: 'task', item: entry.task };
  return null;
};
