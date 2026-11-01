import { ProjectWithCounts } from '@memex/core';
import ProjectCard from './ProjectCard';

interface ProjectsListProps {
  projects: ProjectWithCounts[];
  selectedProjectIds: string[];
  onToggleProject: (projectId: string) => void;
  onToggleStar: (projectId: string, isStarred: boolean) => void;
}

const ProjectsList = ({
  projects,
  selectedProjectIds,
  onToggleProject,
  onToggleStar,
}: ProjectsListProps) => {
  const unselectedProjects = projects.filter(
    (p) => !selectedProjectIds.includes(p.id),
  );

  const starredProjects = unselectedProjects
    .filter((p) => p.is_starred)
    .sort((a, b) => {
      const countA = a.links?.[0]?.count || 0;
      const countB = b.links?.[0]?.count || 0;
      return countB - countA; // Sort descending (most to least)
    });
  const unstarredProjects = unselectedProjects
    .filter((p) => !p.is_starred)
    .sort((a, b) => {
      const countA = a.links?.[0]?.count || 0;
      const countB = b.links?.[0]?.count || 0;
      return countB - countA; // Sort descending (most to least)
    });

  return (
    <div className="flex-1 overflow-y-auto" style={{ paddingBottom: '101px' }}>
      {projects && projects.length > 0 ? (
        <div>
          {/* Starred Projects */}
          {starredProjects.length > 0 && (
            <div>
              {starredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onToggleProject={onToggleProject}
                  onToggleStar={onToggleStar}
                  variant="list"
                />
              ))}
            </div>
          )}

          {/* All Projects */}
          {unstarredProjects.length > 0 && (
            <div>
              {unstarredProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onToggleProject={onToggleProject}
                  onToggleStar={onToggleStar}
                  variant="list"
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 text-center text-sm text-gray-500">
          No projects yet
        </div>
      )}
    </div>
  );
};

export default ProjectsList;
