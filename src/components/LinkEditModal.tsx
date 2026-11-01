import { useEffect, useRef, useState } from 'react';
import { LinkWithTag } from '@memex/core';
import { useProjects } from '../hooks/useProjects';
import { useTags, useCreateTag, TAG_COLORS } from '../hooks/useTags';
import { useUpdateLink } from '../hooks/useLinks';

interface LinkEditModalProps {
  link: LinkWithTag;
  isOpen: boolean;
  onClose: () => void;
  onDelete: () => void;
}

const LinkEditModal = ({
  link,
  isOpen,
  onClose,
  onDelete,
}: LinkEditModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [editUrl, setEditUrl] = useState(link.url);
  const [editTitle, setEditTitle] = useState(link.title || '');
  const [editDescription, setEditDescription] = useState(link.description || '');
  const [selectedTagId, setSelectedTagId] = useState(link.tag_id || '');
  const [selectedProjectId, setSelectedProjectId] = useState(link.project_id);
  const [showNewTagForm, setShowNewTagForm] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);

  const { data: projects } = useProjects();
  const { data: tags } = useTags();
  const updateLink = useUpdateLink();
  const createTag = useCreateTag();

  useEffect(() => {
    setEditUrl(link.url);
    setEditTitle(link.title || '');
    setEditDescription(link.description || '');
    setSelectedTagId(link.tag_id || '');
    setSelectedProjectId(link.project_id);
  }, [link]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const handleSave = async () => {
    const updates = {
      url: editUrl.trim(),
      title: editTitle.trim() || undefined,
      description: editDescription.trim() || undefined,
      tag_id: selectedTagId || undefined,
      project_id: selectedProjectId,
    };

    const oldProjectId =
      link.project_id !== selectedProjectId ? link.project_id : undefined;

    try {
      await updateLink.mutateAsync({
        id: link.id,
        updates,
        oldProjectId,
      });
      onClose();
    } catch (error) {
      console.error('Failed to update link:', error);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;

    try {
      const newTag = await createTag.mutateAsync({
        name: newTagName.trim(),
        color: newTagColor,
      });
      setSelectedTagId(newTag.id);
      setNewTagName('');
      setShowNewTagForm(false);
    } catch (error) {
      console.error('Failed to create tag:', error);
    }
  };

  const currentProject = projects?.find((p) => p.id === selectedProjectId);
  const hasChanges =
    editUrl !== link.url ||
    editTitle !== (link.title || '') ||
    editDescription !== (link.description || '') ||
    selectedTagId !== (link.tag_id || '') ||
    selectedProjectId !== link.project_id;

  return (
    <dialog
      ref={dialogRef}
      className="app-modal"
      aria-labelledby="link-edit-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <header className="app-modal-header">
        <div className="app-modal-title-wrap">
          {link.favicon_url && (
            <img
              src={link.favicon_url}
              alt=""
              width={20}
              height={20}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <h2 id="link-edit-title" className="app-modal-title">
            Edit link
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
        <div className="app-field">
          <label className="app-field-label" htmlFor="edit-link-url">
            URL
          </label>
          <input
            id="edit-link-url"
            type="url"
            value={editUrl}
            onChange={(e) => setEditUrl(e.target.value)}
            className="input-field"
            placeholder="https://example.com"
          />
        </div>

        <div className="app-field">
          <label className="app-field-label" htmlFor="edit-link-title">
            Title
          </label>
          <input
            id="edit-link-title"
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="input-field"
            placeholder="Optional title"
          />
        </div>

        <div className="app-field">
          <label className="app-field-label" htmlFor="edit-link-description">
            Description
          </label>
          <textarea
            id="edit-link-description"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            className="input-field"
            rows={3}
            placeholder="Optional description"
          />
        </div>

        <div className="app-field">
          <label className="app-field-label" htmlFor="edit-link-tag">
            Tag
          </label>
          <select
            id="edit-link-tag"
            value={selectedTagId}
            onChange={(e) => setSelectedTagId(e.target.value)}
            className="input-field"
          >
            <option value="">No tag</option>
            {tags?.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>

          {!showNewTagForm ? (
            <button
              type="button"
              onClick={() => setShowNewTagForm(true)}
              className="btn-secondary btn-compact"
            >
              Create new tag
            </button>
          ) : (
            <div className="app-modal-panel">
              <div className="app-field">
                <label className="app-field-label" htmlFor="new-tag-name">
                  Tag name
                </label>
                <input
                  id="new-tag-name"
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  className="input-field"
                  autoFocus
                />
              </div>
              <div className="app-field">
                <label className="app-field-label" htmlFor="new-tag-color">
                  Color
                </label>
                <select
                  id="new-tag-color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="input-field"
                >
                  {TAG_COLORS.map((color) => (
                    <option key={color} value={color}>
                      {color.replace('#', '').toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div className="app-modal-footer-actions">
                <button
                  type="button"
                  onClick={handleCreateTag}
                  disabled={createTag.isPending || !newTagName.trim()}
                  className="btn-primary btn-compact"
                >
                  {createTag.isPending ? 'Creating…' : 'Create tag'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewTagForm(false);
                    setNewTagName('');
                  }}
                  className="btn-secondary btn-compact"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="app-field">
          <label className="app-field-label" htmlFor="edit-link-project">
            Project
          </label>
          <select
            id="edit-link-project"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="input-field"
          >
            {projects?.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          {selectedProjectId !== link.project_id && currentProject && (
            <p className="app-modal-hint">
              This will move the link to “{currentProject.name}”.
            </p>
          )}
        </div>
      </div>

      <footer className="app-modal-footer">
        <button type="button" onClick={onDelete} className="btn-danger">
          Delete link
        </button>
        <div className="app-modal-footer-actions">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={updateLink.isPending || !editUrl.trim() || !hasChanges}
            className="btn-primary"
          >
            {updateLink.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </footer>
    </dialog>
  );
};

export default LinkEditModal;
