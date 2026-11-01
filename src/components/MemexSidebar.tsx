import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Check, CircleUser, Plus, Settings } from 'lucide-react';
import { INBOX_PARAM, JOURNAL_PATH, LIBRARY_PATH, TYPE_PARAM, spacePath } from '../constants/modules';
import { useJournal } from '../hooks/useJournal';
import { useFeedbackToast } from '../hooks/useFeedbackToast';
import { useAddToSpace } from '../hooks/useAddToSpace';
import { useProfileLinkMembership } from '../hooks/useProfileLinks';
import { useProfileNoteMembership } from '../hooks/useProfileNotes';
import { useProfileTaskMembership } from '../hooks/useProfileTasks';
import { useProfiles } from '../hooks/useProfiles';
import { useAppStore } from '../store';
import { useSpaceColors } from '../hooks/useSpaceColors';
import { useSession } from '../context/SessionContext';
import supabase from '../supabase';
import { FeedbackToast } from './ui';
import ApiTokensModal from './ApiTokensModal';
import SettingsMenu from './SettingsMenu';
import { userDisplayName } from '../utils/userDisplay';
import { parseItemKey } from '@memex/core';
import NewSpaceModal from './NewSpaceModal';
import { InboxIcon, JournalIcon, LibraryIcon, PlusIcon, TasksIcon } from './icons';
import Wordmark from './ui/Wordmark';

const itemClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? 'memex-sidebar-item is-active' : 'memex-sidebar-item';

/**
 * App navigation (decision 12B): Journal, Library, Inbox (only while a filing
 * suggestion is waiting), Tasks, then the segmented list of spaces. While a stream selection is active, spaces turn into bulk-assign
 * targets — clicking one adds the selected items to that space instead of
 * navigating. The header reads "Add N to…"; hovering a space tints the row in
 * its own hue and grows the dot into a "+" disc. After adding, the disc shows
 * a check and the count a "+N" for a moment; spaces that already hold every
 * selected item read "All in" and step back.
 */

const JUST_ADDED_MS = 1400;
const MemexSidebar = () => {
  const { data: profiles } = useProfiles();
  const spaceColors = useSpaceColors();
  const { data: linkMembership } = useProfileLinkMembership();
  const { data: noteMembership } = useProfileNoteMembership();
  const { data: taskMembership } = useProfileTaskMembership();
  const { toast, flash, handleAnimationEnd } = useFeedbackToast();
  const addToSpace = useAddToSpace(flash);

  const selectionMode = useAppStore((state) => state.selectionMode);
  const selectedItemKeys = useAppStore((state) => state.selectedItemKeys);
  const bulkAssignActive = selectionMode && selectedItemKeys.length > 0;
  const [justAdded, setJustAdded] = useState<{
    spaceId: string;
    added: number;
    from: number;
  } | null>(null);
  const justAddedTimer = useRef<number | undefined>(undefined);

  const [isCreating, setIsCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tokensOpen, setTokensOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const footRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { session } = useSession();
  const user = session?.user ?? null;

  // Settings popover: dismiss on outside click and Escape
  useEffect(() => {
    if (!settingsOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!footRef.current?.contains(event.target as Node)) setSettingsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [settingsOpen]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  // Phone bottom bar scrolls horizontally: bring the active item into view
  // whenever the route changes so the current space is never off-screen
  useEffect(() => {
    if (!window.matchMedia('(max-width: 899px)').matches) return;
    const active = scrollRef.current?.querySelector<HTMLElement>('.memex-sidebar-item.is-active');
    active?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [location.pathname]);

  const spaces = useMemo(() => profiles ?? [], [profiles]);
  const { inbox } = useJournal();
  const searchParams = new URLSearchParams(location.search);
  const onTasks = location.pathname === LIBRARY_PATH && searchParams.get(TYPE_PARAM) === 'task';
  const onInbox = location.pathname === JOURNAL_PATH && searchParams.get(INBOX_PARAM) === '1';

  const spaceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const bump = (id: string) => {
      counts[id] = (counts[id] ?? 0) + 1;
    };
    (linkMembership ?? []).forEach((row) => bump(row.profile_id));
    (noteMembership ?? []).forEach((row) => bump(row.profile_id));
    (taskMembership ?? []).forEach((row) => bump(row.profile_id));
    return counts;
  }, [linkMembership, noteMembership, taskMembership]);

  // Item keys each space already holds, for the "All in" state
  const memberKeys = useMemo(() => {
    const bySpace = new Map<string, Set<string>>();
    const add = (spaceId: string, key: string) => {
      let keys = bySpace.get(spaceId);
      if (!keys) bySpace.set(spaceId, (keys = new Set()));
      keys.add(key);
    };
    (linkMembership ?? []).forEach((row) => add(row.profile_id, `link:${row.link_id}`));
    (noteMembership ?? []).forEach((row) => add(row.profile_id, `note:${row.note_id}`));
    (taskMembership ?? []).forEach((row) => add(row.profile_id, `task:${row.task_id}`));
    return bySpace;
  }, [linkMembership, noteMembership, taskMembership]);

  const assignableKeys = useMemo(
    () => selectedItemKeys.filter((key) => !parseItemKey(key).id.startsWith('temp-')),
    [selectedItemKeys],
  );

  useEffect(() => () => window.clearTimeout(justAddedTimer.current), []);

  const handleBulkAdd = async (spaceId: string) => {
    const from = spaceCounts[spaceId] ?? 0;
    const added = await addToSpace(spaceId, selectedItemKeys);
    if (added === 0) return;
    window.clearTimeout(justAddedTimer.current);
    setJustAdded({ spaceId, added, from });
    justAddedTimer.current = window.setTimeout(() => setJustAdded(null), JUST_ADDED_MS);
  };

  return (
    <nav className="memex-sidebar" aria-label="Navigation">
      <div className="memex-sidebar-brand">
        <div className="bookmark-toolbar-brand-shell">
          <Wordmark className="bookmark-toolbar-brand" />
        </div>
      </div>

      <div className="memex-sidebar-scroll" ref={scrollRef}>
        <div className="memex-sidebar-nav">
          <NavLink
            to={JOURNAL_PATH}
            end
            className={() => itemClass({ isActive: location.pathname === JOURNAL_PATH && !onInbox })}
          >
            <span className="memex-sidebar-item-icon">
              <JournalIcon />
            </span>
            <span className="memex-sidebar-item-label">Journal</span>
          </NavLink>
          <NavLink
            to={LIBRARY_PATH}
            end
            className={() => itemClass({ isActive: location.pathname === LIBRARY_PATH && !onTasks })}
          >
            <span className="memex-sidebar-item-icon">
              <LibraryIcon />
            </span>
            <span className="memex-sidebar-item-label">Library</span>
          </NavLink>
          {inbox.length > 0 && (
            <NavLink to={`${JOURNAL_PATH}?${INBOX_PARAM}=1`} className={() => itemClass({ isActive: onInbox })}>
              <span className="memex-sidebar-item-icon">
                <InboxIcon />
              </span>
              <span className="memex-sidebar-item-label">Inbox</span>
              <span className="memex-sidebar-item-count" aria-label={`${inbox.length} waiting`}>
                {inbox.length}
              </span>
            </NavLink>
          )}
          <NavLink to={`${LIBRARY_PATH}?${TYPE_PARAM}=task`} className={() => itemClass({ isActive: onTasks })}>
            <span className="memex-sidebar-item-icon">
              <TasksIcon />
            </span>
            <span className="memex-sidebar-item-label">Tasks</span>
          </NavLink>
        </div>

        <div className="memex-sidebar-section">
          <div className="memex-sidebar-section-header">
            <span className="memex-sidebar-kicker" aria-live="polite">
              {bulkAssignActive ? (
                <>
                  Add <strong>{selectedItemKeys.length}</strong> to…
                </>
              ) : (
                'Spaces'
              )}
            </span>
            <button
              type="button"
              className="memex-sidebar-new"
              onClick={() => setIsCreating(true)}
              aria-label="New space"
              title="New space"
            >
              <PlusIcon />
            </button>
          </div>

          <div
            className={`memex-sidebar-nav memex-sidebar-spaces${
              bulkAssignActive ? ' is-bulk-assign' : ''
            }`}
          >
            {spaces.map((space) => {
              const count = spaceCounts[space.id] ?? 0;
              if (bulkAssignActive) {
                const held = memberKeys.get(space.id);
                const added = justAdded?.spaceId === space.id ? justAdded.added : 0;
                // Membership refetches after the write; tick the count up now
                const shownCount = added > 0 ? Math.max(count, justAdded!.from + added) : count;
                const allIn =
                  added === 0 &&
                  assignableKeys.length > 0 &&
                  assignableKeys.every((key) => held?.has(key));
                return (
                  <button
                    key={space.id}
                    type="button"
                    className={`memex-sidebar-item is-bulk-target${allIn ? ' is-all-in' : ''}${
                      added > 0 ? ' is-just-added' : ''
                    }`}
                    style={{ '--space-hue': spaceColors.get(space.id) } as CSSProperties}
                    onClick={() => void handleBulkAdd(space.id)}
                    aria-label={
                      allIn
                        ? `“${space.name}” already has ${
                            assignableKeys.length === 1 ? 'the selected item' : 'all selected items'
                          }`
                        : `Add ${selectedItemKeys.length} selected to “${space.name}”`
                    }
                  >
                    <span className="memex-sidebar-target-disc" aria-hidden="true">
                      {added > 0 ? <Check /> : <Plus />}
                    </span>
                    <span className="memex-sidebar-item-label">{space.name}</span>
                    {added > 0 && (
                      <span className="memex-sidebar-item-delta" aria-hidden="true">
                        +{added}
                      </span>
                    )}
                    <span className="memex-sidebar-item-count">{allIn ? 'All in' : shownCount}</span>
                  </button>
                );
              }
              return (
                <NavLink
                  key={space.id}
                  to={spacePath(space.id)}
                  className={(state) => `${itemClass(state)}${count === 0 ? ' is-empty' : ''}`}
                  style={{ '--space-hue': spaceColors.get(space.id) } as CSSProperties}
                >
                  <span
                    className="memex-space-dot"
                    style={{ background: 'var(--space-hue)' }}
                    aria-hidden="true"
                  />
                  <span className="memex-sidebar-item-label">{space.name}</span>
                  <span className="memex-sidebar-item-count">{count}</span>
                </NavLink>
              );
            })}

            {spaces.length === 0 && (
              <button
                type="button"
                className="memex-sidebar-empty"
                onClick={() => setIsCreating(true)}
              >
                Create your first space
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="memex-sidebar-foot" ref={footRef}>
        {settingsOpen && (
          <div className="bookmark-account-menu memex-sidebar-settings" role="dialog" aria-label="Settings">
            <SettingsMenu
              user={user}
              onOpenTokens={() => {
                setSettingsOpen(false);
                setTokensOpen(true);
              }}
              onLogout={handleLogout}
            />
          </div>
        )}
        <button
          type="button"
          className="memex-sidebar-account"
          onClick={() => setSettingsOpen((open) => !open)}
          aria-expanded={settingsOpen}
          aria-haspopup="dialog"
          aria-label="Open settings"
        >
          <CircleUser aria-hidden="true" className="memex-sidebar-account-avatar" />
          <span className="memex-sidebar-account-name">{userDisplayName(user)}</span>
          <Settings aria-hidden="true" className="memex-sidebar-account-gear" />
        </button>
      </div>

      <ApiTokensModal isOpen={tokensOpen} onClose={() => setTokensOpen(false)} />

      <NewSpaceModal
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        onFeedback={flash}
      />

      {toast !== null && (
        <FeedbackToast
          message={toast.message}
          phase={toast.phase}
          onAnimationEnd={handleAnimationEnd}
        />
      )}
    </nav>
  );
};

export default MemexSidebar;
