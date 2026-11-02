import { changedSinceProposed, proposalFields, type ProposalField, type ProposalTarget } from '@memex/core/agent';
import { getLinkTitle, noteDisplayTitle, type Entry, type InboxProposal, type JournalSpace } from '@memex/core';

/*
 * The Inbox's agent proposals (docs/mcp.md → “Proposals”), ready to show:
 * the item as the phone holds it now, what the agent wants to change (core's
 * proposalFields: a line diff for text, before → after for the rest), and
 * whether the item was edited since. Approving and rejecting are core's
 * applyProposal / rejectProposal (data/actions.ts → decideProposal).
 */

/**
 * The proposal's item, from the Journal's entries (keyed `type:id`).
 * The web's components/journal/proposalTarget.ts does the same; it can move
 * to core once the agent work there settles.
 */
export const proposalTarget = (proposal: InboxProposal, byKey: ReadonlyMap<string, Entry>): ProposalTarget | null => {
  const entry = byKey.get(`${proposal.item_type}:${proposal.item_id}`);
  if (!entry) return null;
  if (entry.kind === 'link') return { type: 'link', item: entry.link };
  if (entry.kind === 'note') return { type: 'note', item: entry.note };
  if (entry.kind === 'task') return { type: 'task', item: entry.task };
  return null;
};

const TYPE_WORD = { link: 'link', note: 'note', task: 'task' } as const;

export interface ProposalView {
  proposal: InboxProposal;
  target: ProposalTarget | null;
  /** “File this link in”, “Add to the end of this note”, “Edit this task”. */
  what: string;
  /** The item's title, or null when it no longer exists. */
  title: string | null;
  /** For `file`: the space it'd go in (undefined if that space is gone). */
  space?: JournalSpace;
  fields: ProposalField[];
  /** The item changed after the agent proposed this. */
  stale: boolean;
  /** Approve needs the item (and, for filing, the space) to still exist. */
  canApply: boolean;
}

const targetTitle = (target: ProposalTarget) =>
  target.type === 'link' ? getLinkTitle(target.item) : target.type === 'note' ? noteDisplayTitle(target.item) : target.item.title;

export const toProposalView = (
  proposal: InboxProposal,
  byKey: ReadonlyMap<string, Entry>,
  spaces: readonly JournalSpace[],
): ProposalView => {
  const target = proposalTarget(proposal, byKey);
  const space = proposal.space_id ? spaces.find((s) => s.id === proposal.space_id) : undefined;
  const what =
    proposal.kind === 'file'
      ? `File this ${TYPE_WORD[proposal.item_type]} in`
      : proposal.kind === 'append'
        ? 'Add to the end of this note'
        : `Edit this ${TYPE_WORD[proposal.item_type]}`;
  return {
    proposal,
    target,
    what,
    title: target ? targetTitle(target) : null,
    space,
    fields: target ? proposalFields(proposal, target) : [],
    stale: target ? changedSinceProposed(proposal, target) : false,
    canApply: Boolean(target) && (proposal.kind !== 'file' || Boolean(space)),
  };
};
