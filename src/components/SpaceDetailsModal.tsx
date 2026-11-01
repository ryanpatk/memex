import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ItemType, Profile } from '@memex/core';
import { LIBRARY_PATH } from '../constants/modules';
import { useDeleteProfile, useUpdateProfile } from '../hooks/useProfiles';
import { useSelfMessages } from '../hooks/useSelfMessages';
import { cue } from '../utils/sound';

interface SpaceDetailsModalProps {
  space: Profile;
  isOpen: boolean;
  onClose: () => void;
  /** Unfiltered item totals for this space (from the stream). */
  typeTotals: Record<ItemType, number>;
  /** Bottom-right toast from the page. */
  onFeedback: (message: string) => void;
}

/**
 * "Space details": rename, see what's in the space, delete it. Opened from
 * the icon chip beside Select in the stream's filter row. Uses the shared
 * `app-modal` dialog anatomy.
 */
const SpaceDetailsModal = ({
  space,
  isOpen,
  onClose,
  typeTotals,
  onFeedback,
}: SpaceDetailsModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const updateProfile = useUpdateProfile();
  const deleteProfile = useDeleteProfile();
  const { messages } = useSelfMessages(space.id);

  const [name, setName] = useState(space.name);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      setName(space.name);
      requestAnimationFrame(() => nameRef.current?.select());
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen, space.name]);

  const trimmed = name.trim();
  const canSave = trimmed.length > 0 && trimmed !== space.name && !updateProfile.isPending;

  const handleSave = async () => {
    if (!canSave) return;
    try {
      await updateProfile.mutateAsync({ id: space.id, updates: { name: trimmed } });
      cue('confirm');
      onFeedback(`Renamed to “${trimmed}”.`);
    } catch (error) {
      cue('error');
      console.error('Failed to rename space:', error);
    }
  };

  const handleDelete = async () => {
    const ok = window.confirm(
      `Delete “${space.name}”?\n\nIts notes, links, and tasks stay in your Library. Jots written in the space are deleted with it. This cannot be undone.`,
    );
    if (!ok) return;
    try {
      await deleteProfile.mutateAsync(space.id);
      cue('dismiss');
      onFeedback(`Deleted “${space.name}”.`);
      onClose();
      navigate(LIBRARY_PATH, { replace: true });
    } catch (error) {
      cue('error');
      console.error('Failed to delete space:', error);
    }
  };

  const created = new Date(space.created_at).toLocaleDateString(undefined, {
    dateStyle: 'medium',
  });
  const total = typeTotals.note + typeTotals.link + typeTotals.task;

  return (
    <dialog
      ref={dialogRef}
      className="app-modal"
      aria-labelledby="space-details-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <header className="app-modal-header">
        <div className="app-modal-title-wrap">
          <h2 id="space-details-title" className="app-modal-title">
            Space details
          </h2>
        </div>
        <button type="button" className="app-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="app-modal-body">
        <section className="bookmark-detail-section">
          <h3 className="bookmark-detail-label">Name</h3>
          <form
            className="memex-space-details-name-row"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSave();
            }}
          >
            <input
              ref={nameRef}
              type="text"
              className="bookmark-detail-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Space name"
              autoComplete="off"
              spellCheck={false}
              disabled={updateProfile.isPending}
            />
            <button
              type="submit"
              className="bookmark-detail-save-url"
              disabled={!canSave}
            >
              {updateProfile.isPending ? 'Saving…' : 'Save'}
            </button>
          </form>
        </section>

        <section className="bookmark-detail-section">
          <h3 className="bookmark-detail-label">Contents</h3>
          <div className="memex-space-details-grid">
            <div className="memex-space-details-stat">
              <b>{typeTotals.note}</b>
              <span>{typeTotals.note === 1 ? 'note' : 'notes'}</span>
            </div>
            <div className="memex-space-details-stat">
              <b>{typeTotals.link}</b>
              <span>{typeTotals.link === 1 ? 'link' : 'links'}</span>
            </div>
            <div className="memex-space-details-stat">
              <b>{typeTotals.task}</b>
              <span>{typeTotals.task === 1 ? 'task' : 'tasks'}</span>
            </div>
          </div>
          <p className="memex-space-details-meta">
            {total} item{total === 1 ? '' : 's'} · {messages.length} note
            {messages.length === 1 ? '' : 's'} to self · created {created}
          </p>
        </section>

        <section className="bookmark-detail-section bookmark-detail-section--danger">
          <h3 className="bookmark-detail-label">Delete</h3>
          <p className="bookmark-detail-hint">
            Removes the space and the jots written in it. Notes, links, and tasks in it stay in
            your Library.
          </p>
          <button
            type="button"
            className="bookmark-detail-delete"
            onClick={() => void handleDelete()}
            disabled={deleteProfile.isPending}
          >
            {deleteProfile.isPending ? 'Deleting…' : 'Delete space'}
          </button>
        </section>
      </div>
    </dialog>
  );
};

export default SpaceDetailsModal;
