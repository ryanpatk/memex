import { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Keyboard, LogOut, Palette, Settings } from 'lucide-react';
import { INBOX_PATH, JOURNAL_PATH, LIBRARY_PATH, SPACES_PATH, TASKS_PATH } from '../../constants/modules';
import { useJournal } from '../../hooks/useJournal';
import { useSession } from '../../context/SessionContext';
import { repository } from '../../data/repository';
import { userDisplayName } from '../../utils/userDisplay';
import { setLook } from '../../look/look';
import Wordmark from '../ui/Wordmark';
import Menu from './Menu';
import SettingsSheet from './SettingsSheet';
import ShortcutsSheet from './ShortcutsSheet';
import { useShortcutsKey } from './useShortcutsKey';
import { useNotNow } from './journal/notNow';

/**
 * The Memory Cards top bar (x01, decision 3 A): the wordmark, three words of
 * navigation (Journal · Cards · Tasks), the Inbox with its count, and the
 * account button (Settings, Keys, Sign out). Space pills live on the Cards
 * page under the hero. On phones the three words become a bottom tab bar.
 */
const CardsTopBar = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { inbox, proposals } = useJournal();
  const { notNow } = useNotNow();
  // Suggestions put away with “Not now” leave the count, as on the Inbox page
  const inboxCount = proposals.length + inbox.filter((item) => !notNow.has(item.entry.id)).length;
  const { session } = useSession();
  const user = session?.user ?? null;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  useShortcutsKey(() => setKeysOpen(true));

  const name = userDisplayName(user);
  const initial = (name.trim()[0] ?? 'M').toUpperCase();
  const cardsActive = pathname === LIBRARY_PATH || pathname.startsWith(`${SPACES_PATH}/`);

  const signOut = async () => {
    try {
      await repository.auth.signOut();
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <header className="mc-top">
      <Link to={JOURNAL_PATH} className="mc-wm" aria-label="memex, Journal">
        <Wordmark />
      </Link>
      <nav className="mc-seg" aria-label="Main">
        <NavLink to={JOURNAL_PATH} end className={({ isActive }) => (isActive ? 'is-on' : '')}>
          Journal
        </NavLink>
        <NavLink to={LIBRARY_PATH} className={cardsActive ? 'is-on' : ''} aria-current={cardsActive ? 'page' : undefined}>
          Cards
        </NavLink>
        <NavLink to={TASKS_PATH} className={({ isActive }) => (isActive ? 'is-on' : '')}>
          Tasks
        </NavLink>
      </nav>
      <div className="mc-top-right">
        <NavLink
          to={INBOX_PATH}
          className={({ isActive }) => `mc-btn mc-inbox-btn${isActive ? ' is-primary' : ''}`}
          aria-label={inboxCount > 0 ? `Inbox, ${inboxCount} waiting` : 'Inbox'}
        >
          Inbox
          {inboxCount > 0 && (
            <span className="mc-badge" aria-hidden="true">
              {inboxCount}
            </span>
          )}
        </NavLink>
        <Menu
          label="Account"
          entries={[
            { kind: 'header', id: 'who', label: name },
            { id: 'settings', label: 'Settings…', icon: <Settings />, onSelect: () => setSettingsOpen(true) },
            { id: 'keys', label: 'Keys', icon: <Keyboard />, shortcut: '?', onSelect: () => setKeysOpen(true) },
            { kind: 'separator', id: 'sep1' },
            { id: 'classic', label: 'Back to the classic look', icon: <Palette />, onSelect: () => void setLook('classic') },
            { kind: 'separator', id: 'sep2' },
            { id: 'out', label: 'Sign out', icon: <LogOut />, onSelect: () => void signOut() },
          ]}
          trigger={(props) => (
            <button {...props} type="button" className="mc-rb mc-avatar" aria-label={`Account: ${name}`}>
              {initial}
            </button>
          )}
        />
      </div>
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ShortcutsSheet open={keysOpen} onClose={() => setKeysOpen(false)} />
    </header>
  );
};

export default CardsTopBar;
