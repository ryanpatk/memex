import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { MarkdownText } from './ui';
import type { MarkdownEditorHandle } from './ui/MarkdownEditor';
import { type NoteWithTags, type UpdateNoteData, relativeTime } from '@memex/core';
import { Ellipsis, Trash2 } from 'lucide-react';
import { notices } from '../utils/notices';

/** `error`: the last save failed. The draft stays in the editor (and unsaved) until a retry or the next edit lands. */
type SaveStatus = 'saved' | 'saving' | 'error';

const AUTOSAVE_DELAY_MS = 800;

// CodeMirror loads with the first opened note, not with the stream
const MarkdownEditor = lazy(() => import('./ui/MarkdownEditor'));

interface NoteEditorProps {
  note: NoteWithTags;
  /** Where Back returns to ("Home", a space name). */
  backLabel?: string;
  /** Spaces the note lives in, for the metadata line. */
  spaceNames?: string[];
  onBack: () => void;
  onSave: (id: string, updates: UpdateNoteData) => Promise<unknown>;
  onDelete: (id: string) => void;
}

const countWords = (text: string) => {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
};

const NoteEditor = ({ note, backLabel = 'notes', spaceNames = [], onBack, onSave, onDelete }: NoteEditorProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(note.title ?? '');
  const [body, setBody] = useState(note.body);
  const [status, setStatusState] = useState<SaveStatus>('saved');
  // Read by the navigation blocker and the unload warning at the moment they fire
  const statusRef = useRef<SaveStatus>('saved');
  const setStatus = useCallback((next: SaveStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);
  const mountedRef = useRef(true);
  /** Bumped per save; only the latest one's outcome sets the status. */
  const attemptRef = useRef(0);

  const lastSavedRef = useRef({ title: note.title ?? '', body: note.body });
  const draftRef = useRef({ title: note.title ?? '', body: note.body });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteIdRef = useRef(note.id);
  const bodyRef = useRef<MarkdownEditorHandle>(null);

  // Re-seed when switching to a different note (saving the old one's pending edits first)
  useEffect(() => {
    if (noteIdRef.current === note.id) return;
    flushRef.current();
    noteIdRef.current = note.id;
    setTitle(note.title ?? '');
    setBody(note.body);
    setStatus('saved');
    lastSavedRef.current = { title: note.title ?? '', body: note.body };
    draftRef.current = { title: note.title ?? '', body: note.body };
  }, [note, setStatus]);

  const persist = useCallback(() => {
    const noteId = noteIdRef.current;
    const draft = draftRef.current;
    const lastSaved = lastSavedRef.current;

    const updates: UpdateNoteData = {};
    if (draft.title !== lastSaved.title) {
      updates.title = draft.title.trim() === '' ? null : draft.title;
    }
    if (draft.body !== lastSaved.body) {
      updates.body = draft.body;
    }
    if (Object.keys(updates).length === 0) {
      setStatus('saved');
      return;
    }

    const saved = { ...draft };
    const attempt = ++attemptRef.current;
    void onSave(noteId, updates)
      .then(() => {
        lastSavedRef.current = saved;
        // Only settle if nothing changed while the request was in flight
        if (
          noteIdRef.current === noteId &&
          draftRef.current.title === saved.title &&
          draftRef.current.body === saved.body
        ) {
          setStatus('saved');
        }
      })
      .catch((error) => {
        console.error('Failed to save note:', error);
        // lastSavedRef stays put, so the next try sends these edits again
        if (!mountedRef.current) {
          // Closed before the save failed: nothing on screen holds the draft any more
          const label = saved.title.trim() || 'a note';
          notices.publish(`Couldn’t save your last edits to “${label.length > 40 ? `${label.slice(0, 40)}…` : label}”.`);
          return;
        }
        // A newer save (in flight or scheduled) will report for itself
        if (attempt !== attemptRef.current || saveTimerRef.current || noteIdRef.current !== noteId) return;
        setStatus('error');
      });
  }, [onSave, setStatus]);

  const scheduleSave = useCallback(() => {
    setStatus('saving');
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      persist();
    }, AUTOSAVE_DELAY_MS);
  }, [persist, setStatus]);

  const flush = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    persist();
  }, [persist]);

  // Flush pending edits on unmount only — via a ref, so callback identity
  // changes across renders never trigger the cleanup mid-session
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(
    () => () => {
      mountedRef.current = false;
      flushRef.current();
    },
    [],
  );

  const retry = () => {
    setStatus('saving');
    flush();
  };

  // Unsaved edits: closing or reloading the tab asks first
  useEffect(() => {
    if (status === 'saved') return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [status]);

  // A save that failed: leaving the note (Back, the sidebar, another page) asks first
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      statusRef.current === 'error' &&
      (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('Your latest edits to this note haven’t saved. Leave anyway and lose them?')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  const handleTitleChange = (next: string) => {
    setTitle(next);
    draftRef.current = { ...draftRef.current, title: next };
    scheduleSave();
  };

  const handleBodyChange = (next: string) => {
    setBody(next);
    draftRef.current = { ...draftRef.current, body: next };
    scheduleSave();
  };

  const handleBack = () => {
    flush();
    onBack();
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Deletion is undoable from the toast, so no confirm dialog here
  const handleDelete = () => {
    setMenuOpen(false);
    // Neutralize any pending auto-save so it can't fire against the deleted note
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    lastSavedRef.current = { ...draftRef.current };
    setStatus('saved');
    onDelete(noteIdRef.current);
  };

  const words = countWords(body);

  return (
    <div className="memex-note-editor">
      <div className="memex-note-editor-toolbar">
        <button type="button" className="bookmark-link-details-back" onClick={handleBack}>
          ← {backLabel}
        </button>

        <span className={`memex-note-editor-status${status === 'error' ? ' is-error' : ''}`} role="status" aria-live="polite">
          {status === 'error' ? (
            <>
              Couldn’t save
              <span aria-hidden="true">·</span>
              <button type="button" className="memex-note-editor-retry" onClick={retry}>
                Retry
              </button>
            </>
          ) : status === 'saving' ? (
            'Saving…'
          ) : (
            'Saved'
          )}
        </span>

        <div className="memex-popover-anchor" ref={menuRef}>
          <button
            type="button"
            className="memex-icon-button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Note actions"
          >
            <Ellipsis aria-hidden="true" />
          </button>
          {menuOpen && (
            <div className="memex-menu memex-menu--end" role="menu">
              <button type="button" role="menuitem" className="is-danger" onClick={handleDelete}>
                <Trash2 aria-hidden="true" /> Delete note
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="memex-note-doc">
      <input
        type="text"
        className="memex-note-title-input"
        value={title}
        onChange={(event) => handleTitleChange(event.target.value)}
        onKeyDown={(event) => {
          // Enter / ↓ move from the title into the body
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Enter' || event.key === 'ArrowDown') {
            event.preventDefault();
            bodyRef.current?.focus('start');
          }
        }}
        placeholder="Untitled note"
        aria-label="Note title"
        autoComplete="off"
        spellCheck={false}
      />

      <p className="memex-note-meta">
        <span>Edited {relativeTime(note.updated_at)}</span>
        {spaceNames.length > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span>{spaceNames.join(', ')}</span>
          </>
        )}
        <span aria-hidden="true">·</span>
        <span>
          {words} word{words === 1 ? '' : 's'}
        </span>
      </p>

      <div className="memex-note-editor-body">
        <Suspense fallback={<MarkdownText>{body}</MarkdownText>}>
          <MarkdownEditor
            key={note.id}
            ref={bodyRef}
            value={body}
            onChange={handleBodyChange}
            placeholder="Write in markdown…"
            ariaLabel="Note body (markdown)"
            autoFocus={!note.body.trim()}
          />
        </Suspense>
      </div>
      </div>
    </div>
  );
};

export default NoteEditor;
