import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { MarkdownText } from './ui';
import type { MarkdownEditorHandle } from './ui/MarkdownEditor';
import { type NoteWithTags, type UpdateNoteData, relativeTime } from '@memex/core';
import { Ellipsis, Trash2 } from 'lucide-react';

type SaveStatus = 'saved' | 'saving';

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
  const [status, setStatus] = useState<SaveStatus>('saved');

  const lastSavedRef = useRef({ title: note.title ?? '', body: note.body });
  const draftRef = useRef({ title: note.title ?? '', body: note.body });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteIdRef = useRef(note.id);
  const bodyRef = useRef<MarkdownEditorHandle>(null);

  // Re-seed when switching to a different note
  useEffect(() => {
    if (noteIdRef.current === note.id) return;
    noteIdRef.current = note.id;
    setTitle(note.title ?? '');
    setBody(note.body);
    setStatus('saved');
    lastSavedRef.current = { title: note.title ?? '', body: note.body };
    draftRef.current = { title: note.title ?? '', body: note.body };
  }, [note]);

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
    void onSave(noteId, updates)
      .then(() => {
        lastSavedRef.current = saved;
        // Only settle if nothing changed while the request was in flight
        if (
          draftRef.current.title === saved.title &&
          draftRef.current.body === saved.body
        ) {
          setStatus('saved');
        }
      })
      .catch((error) => {
        console.error('Failed to save note:', error);
      });
  }, [onSave]);

  const scheduleSave = useCallback(() => {
    setStatus('saving');
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      persist();
    }, AUTOSAVE_DELAY_MS);
  }, [persist]);

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
  useEffect(() => () => flushRef.current(), []);

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
    onDelete(noteIdRef.current);
  };

  const words = countWords(body);

  return (
    <div className="memex-note-editor">
      <div className="memex-note-editor-toolbar">
        <button type="button" className="bookmark-link-details-back" onClick={handleBack}>
          ← {backLabel}
        </button>

        <span className="memex-note-editor-status" role="status" aria-live="polite">
          {status === 'saving' ? 'Saving…' : 'Saved'}
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
