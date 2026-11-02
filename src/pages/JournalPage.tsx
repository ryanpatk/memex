import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Inbox, X } from 'lucide-react';
import { useJournal } from '../hooks/useJournal';
import { useAddToSpace } from '../hooks/useAddToSpace';
import { useFeedbackToast } from '../hooks/useFeedbackToast';
import { useCreateSelfMessage, useDeleteSelfMessage } from '../hooks/useSelfMessages';
import { useAllLinks, useCreateLink } from '../hooks/useLinks';
import { useCreateNote } from '../hooks/useNotes';
import { useCreateTask, useUpdateTask } from '../hooks/useTasks';
import { useAddLinksToProfile } from '../hooks/useProfileLinks';
import { useAddNotesToProfile } from '../hooks/useProfileNotes';
import { useAddTasksToProfile } from '../hooks/useProfileTasks';
import { useDecideProposal } from '../hooks/useProposals';
import JournalComposer from '../components/journal/JournalComposer';
import { PartView, type JournalHandlers } from '../components/journal/JournalParts';
import { ProposalRow } from '../components/journal/ProposalRow';
import { proposalTarget } from '../components/journal/proposalTarget';
import { FeedbackToast } from '../components/ui';
import { INBOX_PARAM, LIBRARY_PATH, NOTE_PARAM } from '../constants/modules';
import {
  toParts,
  type Entry,
  type FileableEntry,
  type InboxProposal,
  type Suggestion,
  type ComposerResult,
  type SelfMessage,
  type TaskWithTags,
  getHostname,
  getLinkTitle,
} from '@memex/core';
import { cue } from '../utils/sound';
import '../styles/journal.css';

/*
 * The Journal, memex's home (ROADMAP.md Phase 1; decisions 11D, 12B, 13B).
 * Everything you write, save and do, in one chronological feed that reads
 * like a chat: newest at the bottom, composer below. The Inbox tray opens
 * beside it only when something waits: agents' proposals (approve or
 * reject; docs/mcp.md) and filing suggestions.
 */

const PAGE = 150;
const UNDO_WINDOW_MS = 6000;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const titleOf = (entry: FileableEntry) =>
  entry.kind === 'link' ? getLinkTitle(entry.link) : entry.kind === 'note' ? entry.note.title || 'Untitled' : entry.task.title;

const JournalPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const inboxOpen = searchParams.get(INBOX_PARAM) === '1';
  const { isLoading, spaces, entries, filer, inbox, proposals, inboxCount } = useJournal();
  const { data: allLinks } = useAllLinks();
  const { toast, flash, handleAnimationEnd } = useFeedbackToast();
  const addToSpace = useAddToSpace(flash);

  const createJot = useCreateSelfMessage();
  const deleteJot = useDeleteSelfMessage();
  const createLink = useCreateLink();
  const createNote = useCreateNote();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const addLinks = useAddLinksToProfile();
  const addNotes = useAddNotesToProfile();
  const addTasks = useAddTasksToProfile();
  const decideProposal = useDecideProposal();
  const [deciding, setDeciding] = useState<{ id: string; decision: 'apply' | 'reject' } | null>(null);
  const entriesByKey = useMemo(() => new Map<string, Entry>(entries.map((e) => [e.id, e])), [entries]);

  const [limit, setLimit] = useState(PAGE);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const pendingDeletes = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const heightBeforeEarlier = useRef<number | null>(null);

  const visible = useMemo(() => entries.filter((e) => !hidden.has(e.id)), [entries, hidden]);
  const parts = useMemo(() => toParts(visible.slice(-limit)), [limit, visible]);
  const hasEarlier = visible.length > limit;

  /* ---------- Scrolling: start at the bottom, stay there while new things arrive ---------- */

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' });
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (heightBeforeEarlier.current !== null) {
      // Loading earlier entries: keep what was on screen where it was
      el.scrollTop += el.scrollHeight - heightBeforeEarlier.current;
      heightBeforeEarlier.current = null;
      return;
    }
    if (stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [parts]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const showEarlier = () => {
    heightBeforeEarlier.current = scrollRef.current?.scrollHeight ?? null;
    setLimit((n) => n + PAGE);
  };

  useEffect(
    () => () => {
      pendingDeletes.current.forEach((timer) => clearTimeout(timer));
    },
    [],
  );

  /* ---------- Writes ---------- */

  const fileIn = useCallback(
    async (kind: 'link' | 'note' | 'task', id: string, spaceIds: string[]) => {
      await Promise.all(
        spaceIds.map((profileId) =>
          kind === 'link'
            ? addLinks.mutateAsync({ profileId, linkIds: [id] })
            : kind === 'note'
              ? addNotes.mutateAsync({ profileId, noteIds: [id] })
              : addTasks.mutateAsync({ profileId, taskIds: [id] }),
        ),
      );
    },
    [addLinks, addNotes, addTasks],
  );

  const openNote = useCallback((noteId: string) => navigate(`${LIBRARY_PATH}?${NOTE_PARAM}=${noteId}`), [navigate]);

  const handleSubmit = useCallback(
    async (result: Exclude<ComposerResult, { kind: 'empty' }>) => {
      stickToBottom.current = true;
      const spaceIds = result.spaces.map((s) => s.id);
      try {
        if (result.kind === 'jot') {
          cue('confirm');
          await createJot.mutateAsync({ profile_id: spaceIds[0] ?? null, body: result.body });
        } else if (result.kind === 'link') {
          const existing = (allLinks ?? []).find((l) => l.url === result.url && !l.id.startsWith('temp-'));
          if (existing) {
            if (spaceIds.length) await fileIn('link', existing.id, spaceIds);
            flash(spaceIds.length ? 'Already saved. Filed it.' : 'Already saved.');
            return;
          }
          cue('confirm');
          const link = await createLink.mutateAsync({ url: result.url });
          if (spaceIds.length) await fileIn('link', link.id, spaceIds);
        } else if (result.kind === 'task') {
          cue('confirm');
          const task = await createTask.mutateAsync({ title: result.title });
          if (spaceIds.length) await fileIn('task', task.id, spaceIds);
        } else {
          cue('confirm');
          const note = await createNote.mutateAsync({ title: result.title, body: result.body });
          if (spaceIds.length) await fileIn('note', note.id, spaceIds);
          flash('Note saved.', { label: 'Open', onClick: () => openNote(note.id) });
        }
        requestAnimationFrame(() => scrollToBottom(true));
      } catch (error) {
        console.error('Failed to save from the composer:', error);
        cue('error');
        flash('Couldn’t save that. Your text is back in the box.');
        throw error;
      }
    },
    [allLinks, createJot, createLink, createNote, createTask, fileIn, flash, openNote, scrollToBottom],
  );

  const handleFile = useCallback(
    (keys: string[], spaceId: string) => {
      void addToSpace(spaceId, keys);
    },
    [addToSpace],
  );

  const handleToggleTask = useCallback(
    (task: TaskWithTags) => {
      if (task.id.startsWith('temp-')) return;
      cue('toggle');
      updateTask.mutate({ id: task.id, updates: { is_done: !task.is_done } });
    },
    [updateTask],
  );

  const convertJot = useCallback(
    async (jot: SelfMessage, kind: 'note' | 'task') => {
      if (jot.id.startsWith('temp-')) return;
      const text = jot.body.trim();
      const firstLine = text.split('\n')[0].trim();
      const spaceIds = jot.profile_id ? [jot.profile_id] : [];
      try {
        if (kind === 'note') {
          const title = firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
          const body = text === firstLine && firstLine.length <= 80 ? '' : text;
          const note = await createNote.mutateAsync({ title, body });
          await fileIn('note', note.id, spaceIds);
          deleteJot.mutate(jot.id);
          cue('confirm');
          flash('Turned into a note.', { label: 'Open', onClick: () => openNote(note.id) });
        } else {
          const task = await createTask.mutateAsync({ title: text.replace(/\s+/g, ' ').slice(0, 200) });
          await fileIn('task', task.id, spaceIds);
          deleteJot.mutate(jot.id);
          cue('confirm');
          flash('Added to tasks.');
        }
      } catch (error) {
        console.error('Failed to convert jot:', error);
        cue('error');
        flash('Couldn’t convert that jot.');
      }
    },
    [createNote, createTask, deleteJot, fileIn, flash, openNote],
  );

  const handleDeleteJot = useCallback(
    (jot: SelfMessage) => {
      if (jot.id.startsWith('temp-')) return;
      const key = `jot:${jot.id}`;
      cue('dismiss');
      setHidden((prev) => new Set(prev).add(key));
      const unhide = () =>
        setHidden((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      const timer = setTimeout(() => {
        pendingDeletes.current.delete(key);
        deleteJot.mutate(jot.id, { onSettled: unhide });
      }, UNDO_WINDOW_MS);
      pendingDeletes.current.set(key, timer);
      const label = jot.body.length > 40 ? `${jot.body.slice(0, 40)}…` : jot.body;
      flash(`Deleted “${label}”.`, {
        label: 'Undo',
        onClick: () => {
          const pending = pendingDeletes.current.get(key);
          if (!pending) return;
          clearTimeout(pending);
          pendingDeletes.current.delete(key);
          unhide();
          cue('confirm');
        },
      });
    },
    [deleteJot, flash],
  );

  const handlers = useMemo<JournalHandlers>(
    () => ({
      onFile: handleFile,
      onToggleTask: handleToggleTask,
      onOpenNote: openNote,
      onJotToNote: (jot) => void convertJot(jot, 'note'),
      onJotToTask: (jot) => void convertJot(jot, 'task'),
      onDeleteJot: handleDeleteJot,
    }),
    [convertJot, handleDeleteJot, handleFile, handleToggleTask, openNote],
  );

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

  const setInboxOpen = (open: boolean) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (open) next.set(INBOX_PARAM, '1');
        else next.delete(INBOX_PARAM);
        return next;
      },
      { replace: true },
    );

  // The tray closes itself once the last suggestion or proposal is handled
  useEffect(() => {
    if (inboxOpen && !isLoading && inboxCount === 0) setInboxOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inboxCount, inboxOpen, isLoading]);

  const today = new Date().toDateString();
  const todayCount = entries.filter((e) => new Date(e.at).toDateString() === today).length;

  return (
    <div className={`jr-page${inboxOpen ? ' has-inbox' : ''}`}>
      <header className="memex-page-header jr-head">
        <div className="memex-page-header-row">
          <div className="memex-page-heading">
            <h1 className="memex-page-title">
              <span className="memex-page-title-text">Journal</span>
            </h1>
            <p className="memex-page-subtitle">{todayCount === 0 ? 'Nothing yet today' : `${todayCount} today`}</p>
          </div>
          {inboxCount > 0 && (
            <div className="memex-page-actions">
              <button
                type="button"
                className={`btn-secondary btn-compact jr-inbox-toggle${inboxOpen ? ' is-open' : ''}`}
                aria-expanded={inboxOpen}
                aria-controls="journal-inbox"
                onClick={() => setInboxOpen(!inboxOpen)}
              >
                <Inbox aria-hidden="true" />
                Inbox
                <span className="jr-count">{inboxCount}</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="jr-body">
        <main className="jr-main" aria-label="Journal">
          <div className="jr-scroll" ref={scrollRef} onScroll={onScroll}>
            <div className="jr-feed">
              {hasEarlier && (
                <button type="button" className="jr-earlier" onClick={showEarlier}>
                  Show earlier
                </button>
              )}
              {!isLoading && parts.length === 0 && (
                <div className="jr-empty">
                  <p className="jr-empty-title">Your Journal starts here</p>
                  <p>Write what’s on your mind, paste a link, or start a line with “[] ” for a task.</p>
                </div>
              )}
              {parts.map((part) => (
                <PartView key={part.id} part={part} filer={filer} spaces={spaces} handlers={handlers} />
              ))}
            </div>
          </div>
          <JournalComposer spaces={spaces} onSubmit={handleSubmit} />
        </main>

        {inboxOpen && inboxCount > 0 && (
          <aside className="jr-inbox" id="journal-inbox" aria-label="Inbox">
            <div className="jr-inbox-head">
              <h2>Inbox</h2>
              <span className="jr-count">{inboxCount}</span>
              <button type="button" className="memex-icon-button is-compact jr-push" aria-label="Close Inbox" onClick={() => setInboxOpen(false)}>
                <X aria-hidden="true" />
              </button>
            </div>
            {proposals.length > 0 && (
              <section aria-labelledby="inbox-agents">
                <h3 className="jr-inbox-section" id="inbox-agents">
                  From agents
                </h3>
                <p className="jr-inbox-lede">Changes an agent asked to make. Nothing changes until you approve; rejected ones are kept as a record.</p>
                <ul className="jr-inbox-list">
                  {proposals.map((proposal) => (
                    <ProposalRow
                      key={proposal.id}
                      proposal={proposal}
                      target={proposalTarget(proposal, entriesByKey)}
                      space={spaces.find((s) => s.id === proposal.space_id)}
                      busy={deciding?.id === proposal.id ? deciding.decision : null}
                      onDecide={(decision) => void handleDecide(proposal, decision)}
                    />
                  ))}
                </ul>
              </section>
            )}
            {inbox.length > 0 && (
              <section aria-labelledby={proposals.length > 0 ? 'inbox-filing' : undefined}>
                {proposals.length > 0 && (
                  <h3 className="jr-inbox-section" id="inbox-filing">
                    Filing suggestions
                  </h3>
                )}
                <p className="jr-inbox-lede">Recent saves with a likely space. One press files each; anything you leave stays fine where it is.</p>
                <ul className="jr-inbox-list">
                  {inbox.map(({ entry, suggestion }) => (
                    <InboxRow key={entry.id} entry={entry} suggestion={suggestion} onFile={handleFile} />
                  ))}
                </ul>
              </section>
            )}
          </aside>
        )}
      </div>

      {toast !== null && (
        <FeedbackToast message={toast.message} phase={toast.phase} action={toast.action} onAnimationEnd={handleAnimationEnd} />
      )}
    </div>
  );
};

const InboxRow = ({ entry, suggestion, onFile }: { entry: FileableEntry; suggestion: Suggestion; onFile: (keys: string[], spaceId: string) => void }) => {
  const sub = entry.kind === 'link' ? getHostname(entry.link.url) : entry.kind === 'note' ? 'Note' : 'Task';
  return (
    <li className="jr-inbox-row">
      <span className="jr-inbox-title">{titleOf(entry)}</span>
      <span className="jr-inbox-sub">{sub}</span>
      <span className="jr-inbox-reason">{suggestion.reason}</span>
      <button
        type="button"
        className="jr-chip is-suggested"
        style={{ '--hue': suggestion.space.color } as CSSProperties}
        aria-label={`File “${titleOf(entry)}” in ${suggestion.space.name}`}
        onClick={() => onFile([entry.id], suggestion.space.id)}
      >
        <i className="jr-dot" aria-hidden="true" />
        <span className="jr-ellipsis">{suggestion.space.name}</span>
        <span className="jr-chip-accept" aria-hidden="true">
          <Check />
        </span>
      </button>
    </li>
  );
};

export default JournalPage;
