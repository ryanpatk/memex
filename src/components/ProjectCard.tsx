import { ProjectWithCounts } from '@memex/core';

interface ProjectCardProps {
  project: ProjectWithCounts;
  isEditing?: boolean;
  editingName?: string;
  onToggleProject: (projectId: string) => void;
  onToggleStar: (projectId: string, isStarred: boolean) => void;
  onStartEditing?: (project: ProjectWithCounts) => void;
  onEditingNameChange?: (value: string) => void;
  onUpdateProjectName?: (newName: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  projectNameInputRef?: React.RefObject<HTMLInputElement | null>;
  variant?: 'list' | 'header';
  className?: string;
  selectedProjects?: ProjectWithCounts[];
  singleSelectedProject?: ProjectWithCounts | null;
  style?: React.CSSProperties;
}

const ProjectCard = ({
  project,
  isEditing = false,
  editingName = '',
  onToggleProject,
  onToggleStar,
  onStartEditing,
  onEditingNameChange,
  onUpdateProjectName,
  onKeyDown,
  projectNameInputRef,
  variant = 'list',
  className = '',
  selectedProjects,
  singleSelectedProject,
  style,
}: ProjectCardProps) => {
  const isHeaderVariant = variant === 'header';
  const showStarAlways = isHeaderVariant || project.is_starred;
  const canEdit = onStartEditing !== undefined;

  // For list variant, use w-full only if className doesn't override it (for horizontal layout)
  const widthClass =
    isHeaderVariant || className.includes('flex-shrink-0') ? '' : 'w-full';

  const baseClasses = isHeaderVariant
    ? 'text-left px-4 border border-medium-grey flex items-center justify-between group cursor-pointer bg-orange border-l-4 text-white rounded-none flex-shrink-0 transition-[background-color,border-color,transform] duration-300 active:scale-[0.96]'
    : `${widthClass} text-left px-4 border-b border-project-card transition-[background-color,border-color,box-shadow,transform] duration-300 flex items-center justify-between group cursor-pointer bg-project-card hover:border-l-2 hover:border-project-card hover:shadow-sm active:scale-[0.96]`;

  const starButtonClasses = isHeaderVariant
    ? 'ml-2 opacity-100 transition-opacity flex-shrink-0 text-white'
    : showStarAlways
    ? 'ml-2 opacity-100 transition-opacity flex-shrink-0 text-orange'
    : 'ml-2 flex-shrink-0 transition-colors text-gray-300 opacity-0 group-hover:opacity-100 hover:text-orange';

  const textColorClasses = isHeaderVariant ? 'text-white' : 'text-black';

  const handleNameClick = (e: React.MouseEvent) => {
    // Only start editing if:
    // 1. We can edit (onStartEditing is provided)
    // 2. We're not already editing
    // 3. This project is selected (in header variant) OR there's exactly one selected project and it's this one
    // Otherwise, let the click bubble up to toggle the project
    if (
      canEdit &&
      !isEditing &&
      (isHeaderVariant ||
        (selectedProjects?.length === 1 &&
          singleSelectedProject?.id === project.id))
    ) {
      e.stopPropagation();
      onStartEditing(project);
    }
    // If conditions aren't met, don't stop propagation - let toggle work
  };

  const handleCardClick = () => {
    // Only toggle project if NOT in header variant (selected state)
    // In header variant, deselection is handled by the X button only
    if (!isHeaderVariant) {
      onToggleProject(project.id);
    }
  };

  const buttonStyle = isHeaderVariant
    ? { height: '61px', width: '18.75rem', ...style }
    : className.includes('flex-shrink-0')
    ? { height: '61px', width: '18.75rem', ...style }
    : { height: '61px', ...style };

  return (
    <button
      onClick={handleCardClick}
      className={`${baseClasses} ${className}`}
      style={buttonStyle}
    >
      <div className="flex-1 min-w-0" onClick={handleNameClick}>
        {isEditing && canEdit ? (
          <input
            ref={projectNameInputRef || undefined}
            type="text"
            value={editingName}
            onChange={(e) => onEditingNameChange?.(e.target.value)}
            onBlur={() => onUpdateProjectName?.(editingName)}
            onKeyDown={onKeyDown}
            className={`text-sm font-medium bg-transparent border-none outline-none w-full ${
              isHeaderVariant
                ? 'text-white placeholder-white placeholder-opacity-70'
                : 'text-black placeholder-black placeholder-opacity-70'
            }`}
            placeholder={project.name}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <p
              className={`font-medium text-sm truncate ${textColorClasses} ${
                (isHeaderVariant ||
                  (canEdit &&
                    selectedProjects?.some((p) => p.id === project.id))) &&
                !isEditing
                  ? 'cursor-text'
                  : ''
              }`}
            >
              {project.name}
            </p>
            <p
              className={`text-xs ${
                isHeaderVariant
                  ? 'text-white text-opacity-80'
                  : textColorClasses
              }`}
            >
              {project.links?.[0]?.count || 0} links
            </p>
          </>
        )}
      </div>
      {isHeaderVariant ? (
        // X button for deselection in header (selected state)
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleProject(project.id);
          }}
          className="ml-2 opacity-100 transition-opacity flex-shrink-0 text-white hover:opacity-80 cursor-pointer"
          title="Deselect project"
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onToggleProject(project.id);
            }
          }}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
      ) : (
        // Pin button for list variant
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar(project.id, project.is_starred);
          }}
          className={starButtonClasses}
          title={project.is_starred ? 'Unpin project' : 'Pin project'}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              onToggleStar(project.id, project.is_starred);
            }
          }}
        >
          <svg
            className="w-4 h-4"
            fill={project.is_starred ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
            />
          </svg>
        </div>
      )}
    </button>
  );
};

export { ProjectCard };
export default ProjectCard;
