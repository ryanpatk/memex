import { useState, useRef, useEffect } from 'react';
import { ProjectWithCounts } from '@memex/core';

interface ProjectSelectorProps {
  projects: ProjectWithCounts[];
  selectedProjectId: string | null;
  onSelect: (projectId: string | null) => void;
  onClose: () => void;
  position: { top: number; left: number };
}

const ProjectSelector = ({
  projects,
  selectedProjectId,
  onSelect,
  onClose,
  position,
}: ProjectSelectorProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (projectId: string | null) => {
    onSelect(projectId);
    onClose();
  };

  return (
    <div
      ref={containerRef}
      className="fixed z-[9999] bg-white border border-medium-grey shadow-lg rounded-sm"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        minWidth: '200px',
        maxWidth: '300px',
        maxHeight: '300px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Search Input */}
      <div className="p-2 border-b border-medium-grey">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search projects…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-2 py-1 text-sm border border-medium-grey rounded-sm focus:outline-none focus:border-orange"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Project List */}
      <div className="overflow-y-auto max-h-[250px]">
        {/* Option to remove project (set to null) */}
        <button
          onClick={() => handleSelect(null)}
          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
            selectedProjectId === null ? 'bg-orange-subtle' : ''
          }`}
        >
          <span className="text-gray-500 italic">No project</span>
        </button>

        {filteredProjects.length > 0 ? (
          filteredProjects.map((project) => (
            <button
              key={project.id}
              onClick={() => handleSelect(project.id)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                selectedProjectId === project.id ? 'bg-orange-subtle' : ''
              }`}
            >
              {project.name}
            </button>
          ))
        ) : (
          <div className="px-3 py-2 text-sm text-gray-500">
            No projects found
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectSelector;

