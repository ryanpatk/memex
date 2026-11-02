import { describe, expect, it } from 'vitest';
import type { InboxProposal } from '@memex/core';
import { buildDemoData } from './fixtures/demoData';
import { toProposalView } from './inbox';
import { toJournal } from './journal';

const NOW = new Date(2026, 10, 1, 12, 0);
const data = buildDemoData(NOW);
const journal = toJournal(data, '#5077ff', NOW);
const byKey = new Map(journal.entries.map((e) => [e.id, e]));
const proposal = (id: string) => data.proposals.find((p) => p.id === id)!;

describe('toProposalView', () => {
  it('shows a filing proposal with its space', () => {
    const view = toProposalView(proposal('pr1'), byKey, journal.spaces);
    expect(view).toMatchObject({ what: 'File this link in', title: 'Progressive disclosure, revisited', canApply: true, stale: false, fields: [] });
    expect(view.space?.name).toBe('Studio');
  });

  it('diffs an append against the note as it is now', () => {
    const view = toProposalView(proposal('pr2'), byKey, journal.spaces);
    expect(view.what).toBe('Add to the end of this note');
    const [text] = view.fields;
    expect(text).toMatchObject({ field: 'text', label: 'Text' });
    const added = text.field === 'text' ? text.lines.filter((l) => l.op === 'add').map((l) => l.text) : [];
    expect(added).toContain('## Day 3');
  });

  it('shows an edit as before → after', () => {
    const view = toProposalView(proposal('pr3'), byKey, journal.spaces);
    expect(view.fields.map((f) => f.field)).toEqual(['title', 'due_date']);
    expect(view.fields[0]).toMatchObject({ before: 'Sketch the share sheet flow' });
  });

  it('can’t be approved when the item or space is gone, and flags edits since', () => {
    const gone: InboxProposal = { ...proposal('pr1'), item_id: 'nope' };
    expect(toProposalView(gone, byKey, journal.spaces)).toMatchObject({ target: null, title: null, canApply: false });
    const noSpace: InboxProposal = { ...proposal('pr1'), space_id: 'nope' };
    expect(toProposalView(noSpace, byKey, journal.spaces)).toMatchObject({ canApply: false, space: undefined });
    const stale: InboxProposal = { ...proposal('pr3'), base_updated_at: '2020-01-01T00:00:00.000Z' };
    expect(toProposalView(stale, byKey, journal.spaces).stale).toBe(true);
  });
});
