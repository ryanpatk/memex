import { useEffect, type ReactNode } from 'react';
import { Outlet, useLocation, useParams } from 'react-router-dom';
import { TASKS_PATH } from '../constants/modules';
import MemexSidebar from './MemexSidebar';
import GoToPalette from './GoToPalette';
import { useProfiles } from '../hooks/useProfiles';
import { useItemDragSource } from '../hooks/useItemDragSource';

/**
 * The signed-in frame: sidebar + the current page (an Outlet, or the Journal
 * at `/`). Also hosts what works on every page: ⌘/Ctrl K (Go to) and item
 * drags onto sidebar spaces.
 */
const MemexShell = ({ children }: { children?: ReactNode }) => {
  const { spaceId } = useParams<{ spaceId?: string }>();
  const { data: profiles } = useProfiles();
  useItemDragSource();

  const { pathname } = useLocation();

  useEffect(() => {
    const space = spaceId ? profiles?.find((p) => p.id === spaceId) : undefined;
    document.title = space ? `${space.name} · memex` : pathname === TASKS_PATH ? 'Tasks · memex' : 'memex';
  }, [pathname, profiles, spaceId]);

  return (
    <div className="memex-shell">
      <MemexSidebar />
      <div className="memex-shell-main">
        {children ?? <Outlet />}
      </div>
      <GoToPalette />
    </div>
  );
};

export default MemexShell;
