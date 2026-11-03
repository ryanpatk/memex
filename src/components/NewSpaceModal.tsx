import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { spacePath } from '../constants/modules';
import { useCreateProfile } from '../hooks/useProfiles';
import { cue } from '../utils/sound';
import { HANDLES_ERRORS } from '../utils/mutationErrors';

interface NewSpaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Bottom-right toast from the host. */
  onFeedback?: (message: string) => void;
}

/**
 * "New space" — the one place spaces are created. A centered dialog on
 * desktop, a bottom sheet on phones (see `.app-modal` phone rules). On
 * success the app navigates into the new space.
 */
const NewSpaceModal = ({ isOpen, onClose, onFeedback }: NewSpaceModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const createProfile = useCreateProfile(HANDLES_ERRORS);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      setName('');
      setError(null);
      dialog.showModal();
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const trimmed = name.trim();
  const canCreate = trimmed.length > 0 && !createProfile.isPending;

  const handleCreate = async () => {
    if (!canCreate) return;
    try {
      const created = await createProfile.mutateAsync({ name: trimmed });
      cue('confirm');
      onFeedback?.(`Created “${trimmed}”.`);
      onClose();
      if (created?.id) navigate(spacePath(created.id));
    } catch (err) {
      cue('error');
      console.error('Failed to create space:', err);
      setError('Couldn’t create the space. Check your connection and try again.');
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="app-modal app-modal--compact"
      aria-labelledby="new-space-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          void handleCreate();
        }}
      >
        <header className="app-modal-header">
          <div className="app-modal-title-wrap">
            <h2 id="new-space-title" className="app-modal-title">
              New space
            </h2>
          </div>
          <button
            type="button"
            className="app-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="app-modal-body">
          <p className="app-modal-hint">
            A space is a context you stand in — a project, a topic, an area of life. Notes,
            links, and tasks you capture inside it stay with it, and it gets its own Notes to
            Self.
          </p>

          <label className="app-field">
            <span className="app-field-label">Name</span>
            <input
              ref={inputRef}
              type="text"
              className="bookmark-detail-input memex-new-space-input"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Home renovation, Reading, EX_P02"
              autoComplete="off"
              spellCheck={false}
              enterKeyHint="done"
              disabled={createProfile.isPending}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'new-space-error' : undefined}
            />
          </label>

          {error && (
            <p id="new-space-error" className="memex-new-space-error" role="alert">
              {error}
            </p>
          )}
        </div>

        <footer className="app-modal-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={!canCreate}>
            {createProfile.isPending ? 'Creating…' : 'Create space'}
          </button>
        </footer>
      </form>
    </dialog>
  );
};

export default NewSpaceModal;
