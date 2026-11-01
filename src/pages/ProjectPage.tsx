import { cue } from '../utils/sound';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useProject,
  useUpdateProject,
  useDeleteProject,
} from '../hooks/useProjects';
import {
  useProjectLinks,
  useCreateLink,
  useDeleteLink,
} from '../hooks/useLinks';
import { useTags } from '../hooks/useTags';
import { CreateLinkData, LinkWithTag } from '@memex/core';
import LinkEditModal from '../components/LinkEditModal';
import { openUrlInBackgroundTab } from '../utils/openUrlInBackgroundTab';

const ProjectPage = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [newItemInput, setNewItemInput] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editingLink, setEditingLink] = useState<LinkWithTag | null>(null);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('');

  // Responsive detection (was Chakra's useBreakpointValue md breakpoint)
  const [isDesktop, setIsDesktop] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 768px)').matches,
  );

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Data hooks
  const { data: project, isLoading: projectLoading } = useProject(projectId!);
  const { data: links, isLoading: linksLoading } = useProjectLinks(projectId!);
  const { data: tags } = useTags();

  // Mutation hooks
  const createLink = useCreateLink();
  const deleteLink = useDeleteLink();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  // Initialize edit state when project loads
  useEffect(() => {
    if (project) {
      setEditName(project.name);
      setEditDescription(project.description || '');
    }
  }, [project]);

  const handleSaveProject = async () => {
    if (!projectId || !editName.trim()) return;

    try {
      await updateProject.mutateAsync({
        id: projectId,
        updates: {
          name: editName.trim(),
          description: editDescription.trim() || undefined,
        },
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update project:', error);
    }
  };

  const handleCancelEdit = () => {
    if (project) {
      setEditName(project.name);
      setEditDescription(project.description || '');
    }
    setIsEditing(false);
  };

  const handleDeleteProject = async () => {
    if (!projectId) return;

    const confirmMessage = `Delete "${project?.name}"?\n\nThis will permanently delete the project and all its links. This action cannot be undone.`;

    if (!confirm(confirmMessage)) return;

    try {
      await deleteProject.mutateAsync(projectId);
      navigate('/dashboard');
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const handleCardClick = (link: LinkWithTag) => {
    setEditingLink(link);
  };

  // URL detection utility
  const isValidUrl = (text: string): boolean => {
    try {
      // Check if it starts with common URL schemes
      if (text.match(/^https?:\/\//i)) {
        new URL(text);
        return true;
      }
      // Check if it looks like a domain (contains a dot and no spaces)
      if (
        text.match(/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.[a-zA-Z]{2,}/) &&
        !text.includes(' ')
      ) {
        new URL(`https://${text}`);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const handleCreateItem = () => {
    const input = newItemInput.trim();
    if (!input || !projectId || createLink.isPending) return;

    if (isValidUrl(input)) {
      const url = input.startsWith('http') ? input : `https://${input}`;
      const linkData: CreateLinkData = {
        project_id: projectId,
        url: url,
      };

      cue('confirm');

      createLink.mutate(linkData, {
        onSuccess: () => {
          setNewItemInput('');
        },
        onError: (error) => {
          console.error('Failed to create link:', error);
        },
      });
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!confirm('Are you sure you want to delete this link?')) return;

    try {
      await deleteLink.mutateAsync(linkId);
    } catch (error) {
      console.error('Failed to delete link:', error);
    }
  };

  const handleOpenLink = (url: string) => {
    openUrlInBackgroundTab(url);
  };

  const handleCloseEditModal = () => {
    setEditingLink(null);
  };

  const handleDeleteLinkFromModal = async () => {
    if (!editingLink) return;

    if (!confirm('Are you sure you want to delete this link?')) return;

    try {
      await deleteLink.mutateAsync(editingLink.id);
      setEditingLink(null);
    } catch (error) {
      console.error('Failed to delete link:', error);
    }
  };

  // Create links cards
  const projectCards: LinkWithTag[] = links || [];

  // Sort cards by updated_at (most recent first)
  projectCards.sort(
    (a, b) =>
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  // Filter cards by selected tag
  const filteredCards = selectedTagFilter
    ? projectCards.filter((link) => link.tag_id === selectedTagFilter)
    : projectCards;

  // Get unique tags used in this project
  const projectTags =
    tags?.filter((tag) => links?.some((link) => link.tag_id === tag.id)) || [];

  if (projectLoading || linksLoading) {
    return (
      <div className="app-loading">
        <div className="app-loading-spinner" aria-label="Loading project" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="app-surface page-shell">
        <div className="page-center">
          <div className="page-card">
            <header className="page-card-header">
              <h1 className="page-card-title">Project not found</h1>
              <p className="page-muted">This project may have been deleted.</p>
            </header>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="btn-primary w-full"
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-surface app-shell h-screen flex flex-col">
      {/* Header - Outside container */}
      <div className="project-topbar flex-shrink-0">
        {!isEditing ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="project-meta-link"
              >
                ← Dashboard
              </button>
              <span className="project-meta-text">·</span>
              <h1 className="project-title truncate">{project.name}</h1>
              {project.description && (
                <>
                  <span className="project-meta-text">·</span>
                  <span className="project-meta-text truncate">
                    {project.description}
                  </span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="btn-secondary btn-compact"
            >
              Edit
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="project-meta-link"
              >
                ← Dashboard
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDeleteProject}
                  disabled={deleteProject.isPending}
                  className="btn-danger btn-compact"
                >
                  {deleteProject.isPending ? 'Deleting…' : 'Delete'}
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="btn-secondary btn-compact"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveProject}
                  disabled={updateProject.isPending || !editName.trim()}
                  className="btn-primary btn-compact"
                >
                  {updateProject.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Project name"
                className="input-field"
                style={{ maxWidth: '240px' }}
                autoFocus
              />
              <input
                type="text"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Description (optional)"
                className="input-field flex-1"
              />
            </div>
          </div>
        )}
      </div>

      {/* Main Content - Inside scrollable container */}
      <div className="project-body">
        <div className="h-full floating-container flex flex-col overflow-hidden">
          <div className="flex flex-col w-full min-h-0 flex-1">
            <div className="project-controls-bar">
              <div className="max-w-6xl mx-auto p-6 flex flex-col gap-4">
                {projectTags.length > 0 && (
                  <div className="project-panel">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="page-caption">Filter</span>
                      <button
                        type="button"
                        onClick={() => setSelectedTagFilter('')}
                        className={`project-chip ${!selectedTagFilter ? 'is-active' : ''}`}
                      >
                        All
                      </button>
                      {projectTags.map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => setSelectedTagFilter(tag.id)}
                          className={`project-chip ${
                            selectedTagFilter === tag.id ? 'is-active' : ''
                          }`}
                        >
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="project-panel flex gap-2">
                  <input
                    type="text"
                    placeholder="Paste a URL to add a link…"
                    value={newItemInput}
                    onChange={(e) => setNewItemInput(e.target.value)}
                    className="input-field flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateItem()}
                  />
                  <button
                    type="button"
                    onClick={handleCreateItem}
                    disabled={createLink.isPending || !newItemInput.trim()}
                    className="btn-primary btn-compact"
                  >
                    {createLink.isPending ? 'Adding…' : 'Add'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              {filteredCards && filteredCards.length > 0 ? (
                <div className="max-w-6xl mx-auto p-6">
                  <div
                    className={`grid gap-4 ${
                      !isDesktop
                        ? 'grid-cols-1'
                        : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                    }`}
                  >
                    {filteredCards.map((link) => (
                      <div
                        key={link.id}
                        className="card project-link-card"
                        onClick={() => handleCardClick(link)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleCardClick(link);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          {link.favicon_url && (
                            <img
                              src={link.favicon_url}
                              alt=""
                              width={16}
                              height={16}
                              className="project-link-card-favicon flex-shrink-0"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          )}
                          <h3 className="project-link-card-title">
                            {link.title || new URL(link.url).hostname}
                          </h3>
                        </div>

                        {link.tag && (
                          <span className="project-link-card-tag">
                            {link.tag.name}
                          </span>
                        )}

                        {link.description && (
                          <p className="project-link-card-description">
                            {link.description}
                          </p>
                        )}

                        <p className="project-link-card-url">{link.url}</p>

                        <div className="project-link-card-actions">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteLink(link.id);
                            }}
                            className="btn-danger btn-compact"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenLink(link.url);
                            }}
                            className="btn-primary btn-compact"
                          >
                            Open
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center p-8">
                  <div className="text-center flex flex-col gap-3 max-w-sm">
                    {selectedTagFilter ? (
                      <>
                        <p className="page-card-title">No links with this tag</p>
                        <p className="page-muted">
                          Try another tag or clear the filter.
                        </p>
                        <button
                          type="button"
                          onClick={() => setSelectedTagFilter('')}
                          className="btn-secondary"
                        >
                          Clear filter
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="page-card-title">No links yet</p>
                        <p className="page-muted">
                          Paste a URL above to add your first link.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {editingLink && (
        <LinkEditModal
          link={editingLink}
          isOpen={!!editingLink}
          onClose={handleCloseEditModal}
          onDelete={handleDeleteLinkFromModal}
        />
      )}
    </div>
  );
};

export default ProjectPage;
