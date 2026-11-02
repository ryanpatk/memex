import type { AuthUser } from '@memex/core';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import AgentTokensModal from './AgentTokensModal';
import ApiTokensModal from './ApiTokensModal';
import SettingsMenu from './SettingsMenu';
import { CloseIcon } from './icons';
import { cue } from '../utils/sound';
import { getHostname, type LinkWithTag } from '@memex/core';
import { repository } from '../data/repository';
import Wordmark from './ui/Wordmark';

interface AppHeaderProps {
  user: AuthUser | null;
  /** Page heading: "Home" or the space name. */
  title: string;
  /** Identity colour shown beside a space title. */
  titleColor?: string;
  /** Quiet line under the title (item count, description). */
  subtitle?: string;
  /** Pinned sites, shown as a labelled launcher row under the heading. */
  pinnedLinks?: LinkWithTag[];
  onPinnedOpen?: (link: LinkWithTag) => void;
  /** Heading-row actions (space edit, Notes to Self toggle). */
  actions?: ReactNode;
}

/** Short launcher label: the site name before any " | tagline" / " - tagline". */
const pinLabel = (link: LinkWithTag) => {
  const title = link.title?.trim();
  if (!title) return getHostname(link.url);
  return title.split(/\s[|·—–-]\s|\s[|·—–]|[|·—–]\s/)[0].trim() || getHostname(link.url);
};

const PinnedLink = ({ link, onOpen }: { link: LinkWithTag; onOpen: (link: LinkWithTag) => void }) => {
  const [failed, setFailed] = useState(false);
  const label = pinLabel(link);
  return (
    <button
      type="button"
      className="memex-launch-chip"
      onClick={() => onOpen(link)}
      title={link.title?.trim() || link.url}
    >
      <span className="memex-launch-chip-icon" aria-hidden="true">
        {link.favicon_url && !failed ? (
          <img src={link.favicon_url} alt="" onError={() => setFailed(true)} />
        ) : (
          label.slice(0, 1).toUpperCase()
        )}
      </span>
      <span className="memex-launch-chip-label">{label}</span>
    </button>
  );
};

const AppHeader = ({
  user,
  title,
  titleColor,
  subtitle,
  pinnedLinks = [],
  onPinnedOpen,
  actions,
}: AppHeaderProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isTokensOpen, setIsTokensOpen] = useState(false);
  const [agentTokensOpen, setAgentTokensOpen] = useState(false);
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches,
  );
  const navigate = useNavigate();

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 899px)');
    const onChange = () => setIsNarrow(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // The phone settings drawer closes on Escape and when the viewport widens
  useEffect(() => {
    if (!isMenuOpen) return;
    if (!isNarrow) {
      setIsMenuOpen(false);
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMenuOpen, isNarrow]);

  const closeDrawer = () => {
    cue('dismiss');
    setIsMenuOpen(false);
  };

  const handleLogout = async () => {
    try {
      await repository.auth.signOut();
      navigate('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  return (
    <header className="memex-page-header">
      <div className="memex-page-header-row">
        {isNarrow && (
          /* On phones the wordmark is the settings handle: opens a left drawer */
          <button
            type="button"
            className="bookmark-toolbar-brand-shell bookmark-toolbar-brand-button"
            onClick={() => setIsMenuOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={isMenuOpen}
            aria-label="Open settings"
          >
            <Wordmark className="bookmark-toolbar-brand" />
          </button>
        )}

        <div className="memex-page-heading">
          <h1 className="memex-page-title">
            {titleColor && (
              <span className="memex-space-dot" style={{ background: titleColor }} aria-hidden="true" />
            )}
            <span className="memex-page-title-text">{title}</span>
          </h1>
          {subtitle && <p className="memex-page-subtitle">{subtitle}</p>}
        </div>

        <div className="memex-page-actions">{actions}</div>
      </div>

      {pinnedLinks.length > 0 && onPinnedOpen && (
        <nav className="memex-launcher" aria-label="Pinned sites">
          {pinnedLinks.map((link) => (
            <PinnedLink key={link.id} link={link} onOpen={onPinnedOpen} />
          ))}
        </nav>
      )}

      {/* Phone settings drawer — portaled to <body> so it sits above the
          fixed bottom bar (the header lives in a lower stacking layer) */}
      {isNarrow &&
        isMenuOpen &&
        createPortal(
          <>
            <button
              type="button"
              className="memex-drawer-scrim"
              aria-label="Close settings"
              onClick={closeDrawer}
            />
            <aside
              className="memex-settings-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Settings"
            >
              <div className="memex-settings-drawer-header">
                <Wordmark className="bookmark-toolbar-brand" />
                <button
                  type="button"
                  className="memex-settings-drawer-close"
                  onClick={closeDrawer}
                  aria-label="Close settings"
                >
                  <CloseIcon />
                </button>
              </div>
              <div className="memex-settings-drawer-body">
                <SettingsMenu
                  user={user}
                  onOpenTokens={() => {
                    setIsMenuOpen(false);
                    setIsTokensOpen(true);
                  }}
                  onOpenAgentTokens={() => {
                    setIsMenuOpen(false);
                    setAgentTokensOpen(true);
                  }}
                  onLogout={handleLogout}
                />
              </div>
            </aside>
          </>,
          document.body,
        )}

      <ApiTokensModal isOpen={isTokensOpen} onClose={() => setIsTokensOpen(false)} />
      <AgentTokensModal isOpen={agentTokensOpen} onClose={() => setAgentTokensOpen(false)} />
    </header>
  );
};

export default AppHeader;
