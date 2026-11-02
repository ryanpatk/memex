/*
 * Inbox proposals on the client side: what a proposal would change (a diff
 * against the item as it is now) and applying it through the normal
 * Repository code when the user approves. The web Inbox uses both; the Expo
 * app can too.
 */
import type { Repository } from '../repository';
import type { InboxProposal, Link, Note, Task } from '../types';
import { appendBlock } from './writes';

/** The item a proposal points at, as the client holds it (null when it no longer exists). */
export type ProposalTarget =
  | { type: 'link'; item: Pick<Link, 'id' | 'title' | 'description' | 'url' | 'updated_at'> }
  | { type: 'note'; item: Pick<Note, 'id' | 'title' | 'body' | 'updated_at'> }
  | { type: 'task'; item: Pick<Task, 'id' | 'title' | 'detail' | 'due_date' | 'is_done' | 'updated_at'> };

export type DiffLine = { op: 'same' | 'add' | 'del'; text: string };

export type ProposalField =
  | { field: 'title' | 'due_date' | 'done'; label: string; before: string; after: string }
  | { field: 'text'; label: string; lines: DiffLine[] };

const MAX_LCS_CELLS = 250_000;

/**
 * Line diff of `before` → `after`. Common leading and trailing lines are
 * matched first (cheap, and enough for appends and small edits); the middle
 * gets an LCS when it is small, else shows as removed-then-added.
 */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  if (before === '') a.length = 0;
  if (after === '') b.length = 0;
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const head: DiffLine[] = a.slice(0, start).map((text) => ({ op: 'same', text }));
  const tail: DiffLine[] = a.slice(endA).map((text) => ({ op: 'same', text }));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  let middle: DiffLine[];
  if (midA.length * midB.length > MAX_LCS_CELLS) {
    middle = [...midA.map((text) => ({ op: 'del' as const, text })), ...midB.map((text) => ({ op: 'add' as const, text }))];
  } else {
    const n = midA.length;
    const m = midB.length;
    const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i][j] = midA[i] === midB[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    middle = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) {
        middle.push({ op: 'same', text: midA[i] });
        i++;
        j++;
      } else if (lcs[i + 1][j] >= lcs[i][j + 1]) middle.push({ op: 'del', text: midA[i++] });
      else middle.push({ op: 'add', text: midB[j++] });
    }
    while (i < n) middle.push({ op: 'del', text: midA[i++] });
    while (j < m) middle.push({ op: 'add', text: midB[j++] });
  }
  return [...head, ...middle, ...tail];
}

/**
 * Collapse runs of unchanged lines longer than `context * 2` to the
 * `context` lines on either side of a change, with a marker line between.
 */
export function compactDiff(lines: DiffLine[], context = 2): (DiffLine | { op: 'skip'; count: number })[] {
  const keep = lines.map(() => false);
  lines.forEach((l, i) => {
    if (l.op === 'same') return;
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true;
  });
  const out: (DiffLine | { op: 'skip'; count: number })[] = [];
  let skipped = 0;
  lines.forEach((l, i) => {
    if (keep[i]) {
      if (skipped) out.push({ op: 'skip', count: skipped });
      skipped = 0;
      out.push(l);
    } else skipped++;
  });
  if (skipped) out.push({ op: 'skip', count: skipped });
  return out;
}

const TEXT_LABEL = { link: 'Description', note: 'Text', task: 'Detail' } as const;

const currentText = (target: ProposalTarget): string =>
  target.type === 'link' ? target.item.description ?? '' : target.type === 'note' ? target.item.body ?? '' : target.item.detail ?? '';

/** What applying the proposal would change, field by field. Empty for `file` proposals. */
export function proposalFields(proposal: InboxProposal, target: ProposalTarget): ProposalField[] {
  if (proposal.kind === 'file') return [];
  if (proposal.kind === 'append') {
    const before = currentText(target);
    return [{ field: 'text', label: TEXT_LABEL[target.type], lines: lineDiff(before, appendBlock(before, proposal.changes.text ?? '')) }];
  }
  const c = proposal.changes;
  const fields: ProposalField[] = [];
  if (c.title !== undefined) fields.push({ field: 'title', label: 'Title', before: target.item.title ?? '', after: c.title });
  if (c.text !== undefined) fields.push({ field: 'text', label: TEXT_LABEL[target.type], lines: lineDiff(currentText(target), c.text) });
  if (target.type === 'task') {
    if (c.due_date !== undefined) fields.push({ field: 'due_date', label: 'Due', before: target.item.due_date ?? 'none', after: c.due_date ?? 'none' });
    if (c.done !== undefined) {
      fields.push({ field: 'done', label: 'Status', before: target.item.is_done ? 'done' : 'not done', after: c.done ? 'done' : 'not done' });
    }
  }
  return fields;
}

/** True when the item was edited after the agent proposed the change. */
export const changedSinceProposed = (proposal: InboxProposal, target: ProposalTarget): boolean =>
  !!proposal.base_updated_at && Date.parse(target.item.updated_at) > Date.parse(proposal.base_updated_at) + 1000;

export type ProposalRepository = Pick<Repository, 'links' | 'notes' | 'tasks' | 'spaceLinks' | 'spaceNotes' | 'spaceTasks' | 'proposals'>;

/**
 * Approve: apply the change through the Repository, then mark the proposal
 * applied. The target is the item as the client holds it now (appends add
 * to its current body). Throws, leaving the proposal pending, when the item
 * is gone or the type doesn't match.
 */
export async function applyProposal(repo: ProposalRepository, proposal: InboxProposal, target: ProposalTarget | null): Promise<void> {
  if (proposal.status !== 'pending') throw new Error('This proposal was already decided');
  if (!target || target.type !== proposal.item_type || target.item.id !== proposal.item_id) {
    throw new Error('The item this proposal is about no longer exists');
  }
  if (proposal.kind === 'file') {
    if (!proposal.space_id) throw new Error('This proposal names no space');
    if (target.type === 'link') await repo.spaceLinks.addLinks(proposal.space_id, [target.item.id]);
    else if (target.type === 'note') await repo.spaceNotes.addNotes(proposal.space_id, [target.item.id]);
    else await repo.spaceTasks.addTasks(proposal.space_id, [target.item.id]);
  } else if (proposal.kind === 'append') {
    if (target.type !== 'note' || typeof proposal.changes.text !== 'string') throw new Error('Only notes take appended text');
    await repo.notes.update(target.item.id, { body: appendBlock(target.item.body ?? '', proposal.changes.text) });
  } else {
    const c = proposal.changes;
    if (target.type === 'note') {
      await repo.notes.update(target.item.id, {
        ...(c.title !== undefined ? { title: c.title } : {}),
        ...(c.text !== undefined ? { body: c.text } : {}),
      });
    } else if (target.type === 'task') {
      await repo.tasks.update(target.item.id, {
        ...(c.title !== undefined ? { title: c.title } : {}),
        ...(c.text !== undefined ? { detail: c.text } : {}),
        ...(c.due_date !== undefined ? { due_date: c.due_date } : {}),
        ...(c.done !== undefined ? { is_done: c.done } : {}),
      });
    } else {
      await repo.links.update(target.item.id, {
        ...(c.title !== undefined ? { title: c.title } : {}),
        ...(c.text !== undefined ? { description: c.text } : {}),
      });
    }
  }
  await repo.proposals.decide(proposal.id, 'applied');
}

/** Reject: the item is untouched; the proposal stays, marked rejected. */
export async function rejectProposal(repo: Pick<Repository, 'proposals'>, proposal: InboxProposal): Promise<void> {
  if (proposal.status !== 'pending') throw new Error('This proposal was already decided');
  await repo.proposals.decide(proposal.id, 'rejected');
}
