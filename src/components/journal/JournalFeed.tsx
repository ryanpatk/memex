import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  groupJots,
  toParts,
  type ComposerResult,
  type Entry,
  type Filer,
  type JournalSpace,
  type SelfMessage,
  type TaskWithTags,
} from '@memex/core';
import { useAddToSpace } from '../../hooks/useAddToSpace';
import { useRemoveFromSpace } from '../../hooks/useRemoveFromSpace';
import type { ToastAction } from '../../hooks/useFeedbackToast';
import { useCreateSelfMessage, useDeleteSelfMessage, useUpdateSelfMessage } from '../../hooks/useSelfMessages';
import { useAllLinks, useCreateLink } from '../../hooks/useLinks';
import { useCreateNote } from '../../hooks/useNotes';
import { useCreateTask, useUpdateTask } from '../../hooks/useTasks';
import { useAddLinksToProfile } from '../../hooks/useProfileLinks';
import { useAddNotesToProfile } from '../../hooks/useProfileNotes';
import { useAddTasksToProfile } from '../../hooks/useProfileTasks';
import JournalComposer, { type JournalComposerHandle } from './JournalComposer';
import { PartView, type JournalHandlers } from './JournalParts';
import { JOT_PARAM, LIBRARY_PATH, NOTE_PARAM } from '../../constants/modules';
import { cue } from '../../utils/sound';

/*
 * The Journal's feed and composer, with every write they make: the home
 * Journal (`/`) and each space page (decision 14B) both render this, so
 * whichever desktop layout decision 17 picks lands in both places. A space
 * page passes its entries already scoped and `scope`: the composer files
 * there unless you @ another space, and entries leave out that space's chip.
 * Newest at the bottom, composer below (decision 1). The page owns the
 * header, the toast and anything beside the feed (Inbox, board).
 *
 * Decision 17B (2026-11-01): the feed is a notebook page (journal.css) and
 * quick jots stack into one thought (core's groupJots). Jots edit in place
 * with Undo; `?jot=<id>` (⌘K) scrolls to a jot and highlights it.
 */

const PAGE = 150;
const UNDO_WINDOW_MS = 6000;
/** How long a jot reached from ⌘K stays highlighted. */
const FOUND_MS = 2400;

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface JournalFeedHandle {
  /** Focus the composer; `prefill` fills an empty composer (e.g. "[] " to start a task). */
  focusComposer: (prefill?: string) => void;
}

interface JournalFeedProps {
  /** The entries to show, oldest first (already scoped on a space page). */
  entries: Entry[];
  spaces: JournalSpace[];
  filer: Filer;
  isLoading: boolean;
  /** A space page's space. */
  scope?: JournalSpace;
  /** Shown when there's nothing yet. */
  empty: ReactNode;
  label: string;
  flash: (message: string, action?: ToastAction) => void;
  dismiss: () => void;
}

const JournalFeed = forwardRef<JournalFeedHandle, JournalFeedProps>(
  ({ entries, spaces, filer, isLoading, scope, empty, label, flash, dismiss }, ref) => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const jotParam = searchParams.get(JOT_PARAM);
    const { data: allLinks } = useAllLinks();
    const addToSpace = useAddToSpace(flash);
    const removeFromSpace = useRemoveFromSpace(flash);

    const createJot = useCreateSelfMessage();
    const deleteJot = useDeleteSelfMessage();
    const updateJot = useUpdateSelfMessage();
    const createLink = useCreateLink();
    const createNote = useCreateNote();
    const createTask = useCreateTask();
    const updateTask = useUpdateTask();
    const addLinks = useAddLinksToProfile();
    const addNotes = useAddNotesToProfile();
    const addTasks = useAddTasksToProfile();

    const [limit, setLimit] = useState(PAGE);
    const [hidden, setHidden] = useState<Set<string>>(() => new Set());
    const [foundKey, setFoundKey] = useState<string | null>(null);
    const shownFound = useRef<string | null>(null);
    const pendingDeletes = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; commit: () => void }>());
    const scrollRef = useRef<HTMLDivElement>(null);
    const composerRef = useRef<JournalComposerHandle>(null);
    const stickToBottom = useRef(true);
    const heightBeforeEarlier = useRef<number | null>(null);

    useImperativeHandle(ref, () => ({ focusComposer: (prefill) => composerRef.current?.focus(prefill) }), []);

    const visible = useMemo(() => entries.filter((e) => !hidden.has(e.id)), [entries, hidden]);
    const parts = useMemo(() => toParts(visible.slice(-limit)), [limit, visible]);
    const rows = useMemo(() => groupJots(parts), [parts]);
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

    // A new scope (another space) starts at its bottom with the first page
    useLayoutEffect(() => {
      stickToBottom.current = true;
      setLimit(PAGE);
    }, [scope?.id]);

    /* ---------- ?jot=<id> (⌘K): load far enough back, scroll to it, highlight it once ---------- */

    useEffect(() => {
      if (!jotParam || isLoading) return;
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(JOT_PARAM);
          return next;
        },
        { replace: true },
      );
      const key = `jot:${jotParam}`;
      const index = visible.findIndex((e) => e.id === key);
      if (index < 0) return; // deleted, or not in this feed: the feed opens as usual
      stickToBottom.current = false;
      shownFound.current = null;
      const need = visible.length - index;
      setLimit((n) => Math.max(n, Math.ceil(need / PAGE) * PAGE));
      setFoundKey(key);
    }, [isLoading, jotParam, setSearchParams, visible]);

    useLayoutEffect(() => {
      if (!foundKey || shownFound.current === foundKey) return;
      const scroller = scrollRef.current;
      const el = scroller?.querySelector<HTMLElement>(`[data-item-key="${CSS.escape(foundKey)}"]`);
      if (!scroller || !el) return;
      shownFound.current = foundKey;
      // Centre it in the feed's own scroller (scrollIntoView would also move the page)
      const box = el.getBoundingClientRect();
      const frame = scroller.getBoundingClientRect();
      scroller.scrollTop += box.top - frame.top - Math.max(0, (scroller.clientHeight - box.height) / 2);
      el.focus({ preventScroll: true });
    }, [foundKey, rows]);

    useEffect(() => {
      if (!foundKey) return;
      const timer = setTimeout(() => setFoundKey(null), FOUND_MS);
      return () => clearTimeout(timer);
    }, [foundKey]);

    const onScroll = () => {
      const el = scrollRef.current;
      if (!el) return;
      stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };

    const showEarlier = () => {
      heightBeforeEarlier.current = scrollRef.current?.scrollHeight ?? null;
      setLimit((n) => n + PAGE);
    };

    useEffect(() => {
      const deletes = pendingDeletes.current;
      return () => {
        // Leaving commits anything still waiting for Undo
        deletes.forEach(({ timer, commit }) => {
          clearTimeout(timer);
          commit();
        });
        deletes.clear();
      };
    }, []);

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

    /** On a space page, a save filed only elsewhere leaves this feed: say where it went. */
    const filedElsewhere = useCallback(
      (spaceIds: string[]) => {
        if (!scope || spaceIds.includes(scope.id)) return null;
        const names = spaces.filter((s) => spaceIds.includes(s.id)).map((s) => s.name);
        return names.length ? names.join(', ') : 'your Journal';
      },
      [scope, spaces],
    );

    const handleSubmit = useCallback(
      async (result: Exclude<ComposerResult, { kind: 'empty' }>) => {
        stickToBottom.current = true;
        const spaceIds = result.spaces.map((s) => s.id);
        const elsewhere = filedElsewhere(spaceIds);
        try {
          if (result.kind === 'jot') {
            cue('confirm');
            await createJot.mutateAsync({ profile_id: spaceIds[0] ?? null, body: result.body });
            if (elsewhere) flash(`Jotted in ${elsewhere}.`);
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
            if (elsewhere) flash(`Saved to ${elsewhere}.`);
          } else if (result.kind === 'task') {
            cue('confirm');
            const task = await createTask.mutateAsync({ title: result.title });
            if (spaceIds.length) await fileIn('task', task.id, spaceIds);
            if (elsewhere) flash(`Added to ${elsewhere}.`);
          } else {
            cue('confirm');
            const note = await createNote.mutateAsync({ title: result.title, body: result.body });
            if (spaceIds.length) await fileIn('note', note.id, spaceIds);
            flash(elsewhere ? `Note saved to ${elsewhere}.` : 'Note saved.', { label: 'Open', onClick: () => openNote(note.id) });
          }
          requestAnimationFrame(() => scrollToBottom(true));
        } catch (error) {
          console.error('Failed to save from the composer:', error);
          cue('error');
          flash('Couldn’t save that. Your text is back in the box.');
          throw error;
        }
      },
      [allLinks, createJot, createLink, createNote, createTask, fileIn, filedElsewhere, flash, openNote, scrollToBottom],
    );

    const handleFile = useCallback(
      (keys: string[], spaceId: string) => {
        void addToSpace(spaceId, keys);
      },
      [addToSpace],
    );

    const handleUnfile = useCallback(
      (keys: string[], spaceId: string, what?: string) => {
        void removeFromSpace(spaceId, keys, what);
      },
      [removeFromSpace],
    );

    const handleToggleTask = useCallback(
      (task: TaskWithTags) => {
        if (task.id.startsWith('temp-')) return;
        cue('toggle');
        const next = !task.is_done;
        updateTask.mutate({ id: task.id, updates: { is_done: next } });
        if (!next) {
          flash(`Reopened “${task.title}”.`);
          return;
        }
        flash(`Done: “${task.title}”.`, {
          label: 'Undo',
          onClick: () => {
            updateTask.mutate({ id: task.id, updates: { is_done: false } });
            cue('confirm');
            dismiss();
          },
        });
      },
      [dismiss, flash, updateTask],
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
        const commit = () => deleteJot.mutate(jot.id, { onSettled: unhide });
        const timer = setTimeout(() => {
          pendingDeletes.current.delete(key);
          commit();
        }, UNDO_WINDOW_MS);
        pendingDeletes.current.set(key, { timer, commit });
        const what = jot.body.length > 40 ? `${jot.body.slice(0, 40)}…` : jot.body;
        flash(`Deleted “${what}”.`, {
          label: 'Undo',
          onClick: () => {
            const pending = pendingDeletes.current.get(key);
            if (!pending) return;
            clearTimeout(pending.timer);
            pendingDeletes.current.delete(key);
            unhide();
            cue('confirm');
            dismiss();
          },
        });
      },
      [deleteJot, dismiss, flash],
    );

    const handleEditJot = useCallback(
      (jot: SelfMessage, body: string) => {
        const before = jot.body;
        const onError = (error: unknown) => {
          console.error('Failed to edit a jot:', error);
          cue('error');
          flash('Couldn’t save that edit. The jot is as it was.');
        };
        cue('confirm');
        updateJot.mutate({ id: jot.id, updates: { body } }, { onError });
        flash('Jot edited.', {
          label: 'Undo',
          onClick: () => {
            updateJot.mutate({ id: jot.id, updates: { body: before } }, { onError });
            cue('dismiss');
            dismiss();
          },
        });
      },
      [dismiss, flash, updateJot],
    );

    const handlers = useMemo<JournalHandlers>(
      () => ({
        onFile: handleFile,
        onUnfile: handleUnfile,
        onToggleTask: handleToggleTask,
        onOpenNote: openNote,
        onJotToNote: (jot) => void convertJot(jot, 'note'),
        onJotToTask: (jot) => void convertJot(jot, 'task'),
        onDeleteJot: handleDeleteJot,
        onEditJot: handleEditJot,
      }),
      [convertJot, handleDeleteJot, handleEditJot, handleFile, handleToggleTask, handleUnfile, openNote],
    );

    return (
      <main className="jr-main" aria-label={label}>
        <div className="jr-scroll" ref={scrollRef} onScroll={onScroll}>
          <div className="jr-feed">
            {hasEarlier && (
              <button type="button" className="jr-earlier" onClick={showEarlier}>
                Show earlier
              </button>
            )}
            {!isLoading && parts.length === 0 && empty}
            {rows.map(({ part, cont, held }) => (
              <PartView
                key={part.id}
                part={part}
                filer={filer}
                spaces={spaces}
                handlers={handlers}
                scopeSpaceId={scope?.id}
                cont={cont}
                held={held}
                found={part.id === foundKey}
              />
            ))}
          </div>
        </div>
        <JournalComposer ref={composerRef} spaces={spaces} defaultSpace={scope} onSubmit={handleSubmit} />
      </main>
    );
  },
);

JournalFeed.displayName = 'JournalFeed';

export default JournalFeed;
