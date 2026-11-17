import { useEffect, type ReactNode } from 'react';
import { Outlet, useLocation, useParams } from 'react-router-dom';
import { TASKS_PATH } from '../constants/modules';
import GoToPalette from './GoToPalette';
import ShellNotices from './ShellNotices';
import { useProfiles } from '../hooks/useProfiles';
import { useItemDragSource } from '../hooks/useItemDragSource';
import CardsTopBar from './cards/CardsTopBar';

/**
 * The signed-in frame: the top bar over the current page (an Outlet, or the
 * Journal at `/`), one scrolling column. Also hosts what works on every
 * page: ⌘/Ctrl K (Go to), item drags onto space pills, the offline line
 * and the fallback toast for failed writes (ShellNotices).
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

  // Memory Cards (x01): a top bar over one scrolling column, no sidebar
  return (
    <div className="mc-shell">
      <a className="mc-btn is-primary mc-skip" href="#mc-main">
        Skip to content
      </a>
      <div className="mc-shell-main" id="mc-main" tabIndex={-1}>
        <CardsTopBar />
        {children ?? <Outlet />}
        <ShellNotices />
      </div>
      <GoToPalette />
    </div>
  );
};

export default MemexShell;
