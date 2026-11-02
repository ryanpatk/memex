import type { ComposerResult, ComposerSpace } from '../composer';
import { compareDoneTasks, compareOpenTasks } from '../tasks/tasks';
import type { LinkWithTag, NoteWithTags, ProfileLinkMembership, TaskWithTags } from '../types';
import { entriesInSpace, type Entry } from './feed';

/*
 * A space page (decision 14B, ROADMAP.md Phase 1): the space's own Journal,
 * scoped, with a board column beside it. The feed is `entriesInSpace` over
 * the Journal's entries; this module adds what the page needs on top:
 * composer filing that defaults to the space, and the board's sections.
 * Plain TS with no React.
 */

/**
 * The composer on a space page files into that space unless the text names
 * spaces itself: an explicit `@Other` wins (it replaces the default rather
 * than adding to it, so you can write from one space into another).
 */
export const withDefaultSpace = <R extends ComposerResult>(result: R, space: ComposerSpace | null | undefined): R =>
  space && result.spaces.length === 0 ? { ...result, spaces: [space] } : result;

/** The board column, 14B: pinned sites, open tasks, saves, notes. */
export interface SpaceBoard {
  /** Sites pinned in this space (`profile_links.is_super_favorite`), by name. */
  pinned: LinkWithTag[];
  /** Open tasks in the Tasks view's order: soonest due first, then manual order. */
  openTasks: TaskWithTags[];
  /** Done tasks, most recently ticked first. */
  doneTasks: TaskWithTags[];
  /** Links filed here, newest first. */
  saves: LinkWithTag[];
  /** Notes filed here, most recently edited first. */
  notes: NoteWithTags[];
  /** Jots written in this space. */
  jotCount: number;
  /** Every entry in the space (jots, links, notes, tasks). */
  total: number;
}

const pinLabel = (link: LinkWithTag) => (link.title?.trim() || link.url).toLowerCase();

/**
 * The board for one space, from the Journal's entries (all of them; this
 * scopes) and the link membership rows that carry the per-space pins.
 * Optimistic rows (`temp-` ids) are left out of pins; they can't be pinned yet.
 */
export const spaceBoard = (
  entries: readonly Entry[],
  spaceId: string,
  linkMembership: readonly ProfileLinkMembership[] = [],
): SpaceBoard => {
  const inSpace = entriesInSpace(entries as Entry[], spaceId);
  const links: LinkWithTag[] = [];
  const notes: NoteWithTags[] = [];
  const tasks: TaskWithTags[] = [];
  let jotCount = 0;
  inSpace.forEach((entry) => {
    if (entry.kind === 'link') links.push(entry.link);
    else if (entry.kind === 'note') notes.push(entry.note);
    else if (entry.kind === 'task') tasks.push(entry.task);
    else jotCount += 1;
  });

  const pinnedIds = new Set(
    linkMembership.filter((row) => row.profile_id === spaceId && row.is_super_favorite).map((row) => row.link_id),
  );

  return {
    pinned: links
      .filter((l) => pinnedIds.has(l.id) && !l.id.startsWith('temp-'))
      .sort((a, b) => pinLabel(a).localeCompare(pinLabel(b))),
    openTasks: tasks.filter((t) => !t.is_done).sort(compareOpenTasks),
    doneTasks: tasks.filter((t) => t.is_done).sort(compareDoneTasks),
    saves: [...links].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    notes: [...notes].sort((a, b) => (b.updated_at ?? b.created_at).localeCompare(a.updated_at ?? a.created_at)),
    jotCount,
    total: inSpace.length,
  };
};

/** Whether a link is pinned in a space (the board's pin toggle reads this). */
export const isPinnedInSpace = (
  linkMembership: readonly ProfileLinkMembership[],
  spaceId: string,
  linkId: string,
) => linkMembership.some((row) => row.profile_id === spaceId && row.link_id === linkId && Boolean(row.is_super_favorite));
