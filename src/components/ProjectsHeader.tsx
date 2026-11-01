import { ProjectWithCounts } from '@memex/core';
import ProjectCard from './ProjectCard';

interface ProjectsHeaderProps {
  selectedProjects: ProjectWithCounts[];
  isEditingName: boolean;
  editingProjectName: string;
  editingProjectId: string | null;
  singleSelectedProject: ProjectWithCounts | null;
  onToggleProject: (projectId: string) => void;
  onToggleStar: (projectId: string, isStarred: boolean) => void;
  onStartEditing: (project: ProjectWithCounts) => void;
  onUpdateProjectName: (newName: string) => void;
  onStopEditing: () => void;
  onEditingNameChange: (value: string) => void;
  projectNameInputRef: React.RefObject<HTMLInputElement | null>;
}

const ProjectsHeader = ({
  selectedProjects,
  isEditingName,
  editingProjectName,
  editingProjectId,
  singleSelectedProject,
  onToggleProject,
  onToggleStar,
  onStartEditing,
  onUpdateProjectName,
  onStopEditing,
  onEditingNameChange,
  projectNameInputRef,
}: ProjectsHeaderProps) => {
  const handleProjectNameKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      onStopEditing();
    }
  };

  return (
    <div className="border-b border-medium-grey bg-white h-[61px] relative animate-slide-down">
      <div className="flex flex-row h-full overflow-x-auto overflow-y-hidden">
        {selectedProjects.map((project, index) => (
          <ProjectCard
            key={project.id}
            project={project}
            isEditing={
              isEditingName && editingProjectId === project.id
            }
            editingName={editingProjectName}
            onToggleProject={onToggleProject}
            onToggleStar={onToggleStar}
            onStartEditing={onStartEditing}
            onEditingNameChange={onEditingNameChange}
            onUpdateProjectName={onUpdateProjectName}
            onKeyDown={handleProjectNameKeyDown}
            projectNameInputRef={projectNameInputRef}
            variant="header"
            className="flex-shrink-0 border-r border-medium-grey last:border-r-0 animate-fade-in"
            selectedProjects={selectedProjects}
            singleSelectedProject={singleSelectedProject}
            style={{ animationDelay: `${index * 0.05}s` }}
          />
        ))}
      </div>
    </div>
  );
};

export default ProjectsHeader;
