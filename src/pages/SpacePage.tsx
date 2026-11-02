import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LayoutPanelLeft, Library, Pencil } from 'lucide-react';
import { entriesInSpace, spaceBoard, taskSpaceMap, type ItemType, type JournalSpace, type LinkWithTag, type TaskWithTags } from '@memex/core';
import { useJournal } from '../hooks/useJournal';
import { useFeedbackToast } from '../hooks/useFeedbackToast';
import { useProfiles } from '../hooks/useProfiles';
import { useProfileLinkMembership, useSetProfileLinkSuperFavorite } from '../hooks/useProfileLinks';
import { useProfileTaskMembership } from '../hooks/useProfileTasks';
import { useTaskActions } from '../hooks/useTaskActions';
import JournalFeed, { type JournalFeedHandle } from '../components/journal/JournalFeed';
import SpaceBoard from '../components/space/SpaceBoard';
import SpaceDetailsModal from '../components/SpaceDetailsModal';
import { FeedbackToast } from '../components/ui';
import { JOURNAL_PATH, LIBRARY_PATH, NOTE_PARAM, SPACE_PARAM } from '../constants/modules';
import { cue } from '../utils/sound';
import '../styles/journal.css';
import '../styles/tasks.css';
import '../styles/space.css';

/*
 * A space page, `/spaces/:spaceId` (decision 14B, ROADMAP.md Phase 1): the
 * space's own Journal (every jot written here and every item filed here, in
 * time order, with the composer filing into the space) and a board column
 * beside it: pinned sites, open tasks, saves, notes. The feed is the home
 * Journal's own component, so decision 17's layout applies here too. Narrow
 * windows fold the board behind a header button (`?board=1`). The Library
 * still shows the space as a grid: “Open in Library” (`/library?space=<id>`).
 * Notes: docs/space-page.md.
 */

const BOARD_PARAM = 'board';

const SpacePage = () => {
  const { spaceId = '' } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const boardOpen = searchParams.get(BOARD_PARAM) === '1';
  const { isLoading, spaces, entries, filer } = useJournal();
  const { data: profiles } = useProfiles();
  const { data: linkRows } = useProfileLinkMembership();
  const { data: taskRows } = useProfileTaskMembership();
  const setPin = useSetProfileLinkSuperFavorite();
  const { toast, flash, dismiss, handleAnimationEnd } = useFeedbackToast();
  const feedRef = useRef<JournalFeedHandle>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const profile = profiles?.find((p) => p.id === spaceId);
  const space = spaces.find((s) => s.id === spaceId);

  // A deleted or foreign space id goes back to the Journal once spaces have loaded
  useEffect(() => {
    if (profiles && !profile) navigate(JOURNAL_PATH, { replace: true });
  }, [navigate, profile, profiles]);

  const scoped = useMemo(() => entriesInSpace(entries, spaceId), [entries, spaceId]);
  const board = useMemo(() => spaceBoard(entries, spaceId, linkRows ?? []), [entries, linkRows, spaceId]);
  const spaceById = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);
  const membership = useMemo(() => taskSpaceMap(taskRows ?? []), [taskRows]);
  const { hidden, settling, renamingId, handlers: taskHandlers } = useTaskActions({ flash, dismiss, membership, spaceById });

  const taskSpaces = useCallback(
    (task: TaskWithTags) =>
      (membership.get(task.id) ?? []).map((id) => spaceById.get(id)).filter((s): s is JournalSpace => !!s),
    [membership, spaceById],
  );

  const typeTotals = useMemo<Record<ItemType, number>>(
    () => ({ link: board.saves.length, note: board.notes.length, task: board.openTasks.length + board.doneTasks.length }),
    [board],
  );

  const today = new Date().toDateString();
  const todayCount = scoped.filter((e) => new Date(e.at).toDateString() === today).length;

  const setBoardOpen = (open: boolean) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (open) next.set(BOARD_PARAM, '1');
        else next.delete(BOARD_PARAM);
        return next;
      },
      { replace: true },
    );

  const togglePin = useCallback(
    (link: LinkWithTag, pinned: boolean) => {
      cue('toggle');
      setPin.mutate(
        { profileId: spaceId, linkId: link.id, isSuperFavorite: pinned },
        {
          onError: () => {
            cue('error');
            flash('Couldn’t change the pin. Try again.');
          },
        },
      );
    },
    [flash, setPin, spaceId],
  );

  const openNote = useCallback((noteId: string) => navigate(`${LIBRARY_PATH}?${NOTE_PARAM}=${noteId}`), [navigate]);

  const addTask = useCallback(() => {
    if (boardOpen) setBoardOpen(false);
    requestAnimationFrame(() => feedRef.current?.focusComposer('[] '));
    // setBoardOpen is rebuilt each render from the URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardOpen]);

  if (!space || !profile) {
    return (
      <div className="jr-page sp-page" aria-busy="true">
        <header className="memex-page-header jr-head">
          <div className="memex-page-header-row">
            <div className="memex-page-heading">
              <h1 className="memex-page-title">
                <span className="memex-page-title-text sp-title-skeleton" aria-label="Loading space" />
              </h1>
            </div>
          </div>
        </header>
      </div>
    );
  }

  const subtitle = isLoading
    ? 'Loading…'
    : scoped.length === 0
      ? 'Nothing here yet'
      : `${scoped.length} ${scoped.length === 1 ? 'entry' : 'entries'}${todayCount ? ` · ${todayCount} today` : ''}`;

  return (
    <div className={`jr-page sp-page${boardOpen ? ' has-board' : ''}`} style={{ '--hue': space.color } as CSSProperties}>
      <header className="memex-page-header jr-head">
        <div className="memex-page-header-row">
          <div className="memex-page-heading">
            <h1 className="memex-page-title">
              <span className="memex-space-dot" style={{ background: space.color }} aria-hidden="true" />
              <span className="memex-page-title-text">{space.name}</span>
            </h1>
            <p className="memex-page-subtitle">{subtitle}</p>
          </div>
          <div className="memex-page-actions">
            <button
              type="button"
              className={`btn-secondary btn-compact sp-board-toggle${boardOpen ? ' is-open' : ''}`}
              aria-expanded={boardOpen}
              aria-controls="space-board"
              onClick={() => setBoardOpen(!boardOpen)}
            >
              <LayoutPanelLeft aria-hidden="true" />
              Board
            </button>
            <Link className="btn-secondary btn-compact" to={`${LIBRARY_PATH}?${SPACE_PARAM}=${encodeURIComponent(space.id)}`}>
              <Library aria-hidden="true" />
              <span className="sp-hide-narrow">Open in </span>Library
            </Link>
            <button type="button" className="btn-secondary btn-compact" onClick={() => setDetailsOpen(true)} aria-haspopup="dialog">
              <Pencil aria-hidden="true" />
              Edit space
            </button>
          </div>
        </div>
      </header>

      <div className="jr-body">
        <JournalFeed
          ref={feedRef}
          entries={scoped}
          spaces={spaces}
          filer={filer}
          isLoading={isLoading}
          scope={space}
          label={`${space.name} Journal`}
          flash={flash}
          dismiss={dismiss}
          empty={
            <div className="sp-empty" role="status">
              <span className="sp-empty-disc" aria-hidden="true">
                <i />
              </span>
              <p className="jr-empty-title">A fresh space</p>
              <p>
                Everything you write here is filed in {space.name}. Jot a thought, paste a link, or start a line with
                “[]&nbsp;” for a task.
              </p>
            </div>
          }
        />
        <SpaceBoard
          id="space-board"
          space={space}
          board={board}
          spaces={spaces}
          linkMembership={linkRows ?? []}
          taskSpaces={taskSpaces}
          settling={settling}
          hidden={hidden}
          renamingId={renamingId}
          taskHandlers={taskHandlers}
          onTogglePin={togglePin}
          onOpenNote={openNote}
          onAddTask={addTask}
          onClose={boardOpen ? () => setBoardOpen(false) : undefined}
        />
      </div>

      <SpaceDetailsModal space={profile} isOpen={detailsOpen} onClose={() => setDetailsOpen(false)} typeTotals={typeTotals} onFeedback={flash} />

      {toast !== null && (
        <FeedbackToast message={toast.message} phase={toast.phase} action={toast.action} onAnimationEnd={handleAnimationEnd} />
      )}
    </div>
  );
};

export default SpacePage;
