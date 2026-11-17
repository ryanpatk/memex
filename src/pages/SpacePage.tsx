import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Ellipsis, LayoutGrid, ListTodo, Pencil } from 'lucide-react';
import {
  entriesInSpace,
  relativeTime,
  spaceBoard,
  taskSpaceMap,
  type ItemType,
  type JournalSpace,
  type LinkWithTag,
  type NoteWithTags,
  type TaskWithTags,
} from '@memex/core';
import { useJournal } from '../hooks/useJournal';
import { useFeedbackToast } from '../hooks/useFeedbackToast';
import { useProfiles } from '../hooks/useProfiles';
import { useProfileLinkMembership, useSetProfileLinkSuperFavorite } from '../hooks/useProfileLinks';
import { useProfileTaskMembership } from '../hooks/useProfileTasks';
import { useTaskActions } from '../hooks/useTaskActions';
import JournalFeed, { type JournalFeedHandle } from '../components/journal/JournalFeed';
import { FeedbackToast } from '../components/ui';
import LoadErrorState from '../components/LoadErrorState';
import { HANDLES_ERRORS } from '../utils/mutationErrors';
import { loadStateOf } from '../utils/loadState';
import { JOURNAL_PATH, LIBRARY_PATH, LINK_PARAM, NOTE_PARAM, SPACE_PARAM, TASKS_PATH } from '../constants/modules';
import { cue } from '../utils/sound';
import SpaceBoard from '../components/space/SpaceBoard';
import SpaceDetailsSheet from '../components/cards/SpaceDetailsSheet';
import MoveSheet from '../components/cards/MoveSheet';
import CardsMenu from '../components/cards/Menu';
import { ToggleGroup } from '../components/cards/Controls';
import '../styles/journal.css';

/*
 * A space page, `/spaces/:spaceId` (decision 14B; Memory Cards d03, m02):
 * a colour band with the space's name, count and summary, then its board
 * (pinned sites, open tasks, saves, notes) or, behind the Board · Journal
 * toggle (`?show=journal`), the space's own Journal (every jot written here
 * and every item filed here, with the composer filing into the space; the
 * home Journal's own component). “Open in Cards” shows the space as a grid
 * (`/library?space=<id>`). Notes: docs/space-page.md.
 */

/** Which side of the space page shows (`?show=journal`; the board is the default). */
const SHOW_PARAM = 'show';

const SpacePage = () => {
  const { spaceId = '' } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isLoading, loadState, refetch, spaces, entries, filer } = useJournal();
  const profilesQuery = useProfiles();
  const profiles = profilesQuery.data;
  const spaceLoad = loadStateOf([profilesQuery]);
  const { data: linkRows } = useProfileLinkMembership();
  const { data: taskRows } = useProfileTaskMembership();
  // togglePin reports its own failure
  const setPin = useSetProfileLinkSuperFavorite(HANDLES_ERRORS);
  const { toast, flash, dismiss, handleAnimationEnd } = useFeedbackToast();
  const feedRef = useRef<JournalFeedHandle>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const showJournal = searchParams.get(SHOW_PARAM) === 'journal';
  const [fileInKey, setFileInKey] = useState<string | null>(null);

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
  const { hidden, settling, renamingId, handlers: taskHandlers } = useTaskActions({ flash, dismiss, membership });

  const taskSpaces = useCallback(
    (task: TaskWithTags) =>
      (membership.get(task.id) ?? []).map((id) => spaceById.get(id)).filter((s): s is JournalSpace => !!s),
    [membership, spaceById],
  );

  const typeTotals = useMemo<Record<ItemType, number>>(
    () => ({ link: board.saves.length, note: board.notes.length, task: board.openTasks.length + board.doneTasks.length }),
    [board],
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

  const setShowJournal = useCallback(
    (journal: boolean) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (journal) next.set(SHOW_PARAM, 'journal');
          else next.delete(SHOW_PARAM);
          return next;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  const addTask = useCallback(() => {
    // The composer lives on the Journal side
    if (!showJournal) setShowJournal(true);
    setTimeout(() => feedRef.current?.focusComposer('[] '), 60);
  }, [setShowJournal, showJournal]);

  const openLinkCard = useCallback(
    (link: LinkWithTag) =>
      navigate(`${LIBRARY_PATH}?${SPACE_PARAM}=${encodeURIComponent(spaceId)}&${LINK_PARAM}=${encodeURIComponent(link.id)}`),
    [navigate, spaceId],
  );
  const openNoteCard = useCallback((note: NoteWithTags) => openNote(note.id), [openNote]);


  /* ---------- Memory Cards (d03, m02) ---------- */

  if (spaceLoad === 'failed') {
    return (
      <main className="mc-page">
        <LoadErrorState what="this space" onRetry={() => profilesQuery.refetch()} />
      </main>
    );
  }
  if (!space || !profile) {
    return (
      <main className="mc-page" aria-busy="true">
        <div className="mc-band mc-sp-band" style={{ '--c': 'var(--mc-well)' } as CSSProperties}>
          <span className="mc-sk mc-sp-band-sk" aria-label="Loading space" />
        </div>
      </main>
    );
  }
  const cardCount = board.saves.length + board.notes.length + board.openTasks.length + board.doneTasks.length;
  const lastSave = [...board.saves.map((l) => l.created_at), ...board.notes.map((n) => n.updated_at)].sort().pop();
  const openTaskCount = board.openTasks.length;
  const summary = [
    openTaskCount ? `${openTaskCount} open task${openTaskCount === 1 ? '' : 's'}` : 'No open tasks',
    lastSave ? `last save ${relativeTime(lastSave)}` : '',
    board.jotCount ? `${board.jotCount} jot${board.jotCount === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <main className="mc-page mc-sp" aria-label={space.name} style={{ '--c': space.color } as CSSProperties}>
      <header className="mc-band mc-sp-band">
        <div className="mc-sp-band-text">
          <h1 className="mc-hero mc-sp-hero">
            <span translate="no">{space.name}</span>
            {loadState === 'ready' && <sup aria-label={`${cardCount} cards`}>{cardCount}</sup>}
          </h1>
          <p className="mc-sp-summary">{loadState === 'ready' ? summary : isLoading ? 'Loading…' : ' '}</p>
        </div>
        <div className="mc-sp-band-tools">
          <ToggleGroup
            label="Show"
            value={showJournal ? 'journal' : 'board'}
            options={[
              { value: 'board', label: 'Board' },
              { value: 'journal', label: 'Journal' },
            ]}
            onChange={(value) => setShowJournal(value === 'journal')}
          />
          <CardsMenu
            label={`${space.name} options`}
            entries={[
              { id: 'details', label: 'Space details…', icon: <Pencil />, onSelect: () => setDetailsOpen(true) },
              {
                id: 'cards',
                label: 'Open in Cards',
                icon: <LayoutGrid />,
                onSelect: () => navigate(`${LIBRARY_PATH}?${SPACE_PARAM}=${encodeURIComponent(space.id)}`),
              },
              {
                id: 'tasks',
                label: 'Tasks in this space',
                icon: <ListTodo />,
                onSelect: () => navigate(`${TASKS_PATH}?${SPACE_PARAM}=${encodeURIComponent(space.id)}`),
              },
            ]}
            trigger={(props) => (
              <button {...props} type="button" className="mc-rb" aria-label={`${space.name} options`}>
                <Ellipsis aria-hidden="true" />
              </button>
            )}
          />
        </div>
      </header>

      {showJournal ? (
        <div className="mc-sp-journal">
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
            failure={loadState === 'failed' ? <LoadErrorState what="this space" onRetry={refetch} /> : undefined}
            empty={
              <p className="mc-body mc-sp-hint">
                Everything you write here is filed in {space.name}. Jot a thought, paste a link, or start a line with
                “[]&nbsp;” for a task.
              </p>
            }
          />
        </div>
      ) : loadState === 'failed' ? (
        <LoadErrorState what="this space" onRetry={refetch} />
      ) : (
        <SpaceBoard
          space={space}
          board={board}
          linkMembership={linkRows ?? []}
          taskSpaces={taskSpaces}
          settling={settling}
          hidden={hidden}
          renamingId={renamingId}
          taskHandlers={taskHandlers}
          onTogglePin={togglePin}
          onOpenLink={openLinkCard}
          onOpenNote={openNoteCard}
          onAddTask={addTask}
          onFileIn={setFileInKey}
        />
      )}

      <SpaceDetailsSheet
        space={profile}
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        typeTotals={typeTotals}
        onFeedback={flash}
      />
      <MoveSheet
        open={fileInKey !== null}
        onClose={() => setFileInKey(null)}
        itemKeys={fileInKey ? [fileInKey] : []}
        onFeedback={flash}
      />

      {toast !== null && (
        <FeedbackToast message={toast.message} phase={toast.phase} action={toast.action} onAnimationEnd={handleAnimationEnd} />
      )}
    </main>
  );
};

export default SpacePage;
