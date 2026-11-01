import type { AuthUser } from '@memex/core';
import CanvasColorPicker from './CanvasColorPicker';
import DarkModeToggle from './DarkModeToggle';
import SoundToggle from './SoundToggle';
import { LINK_CAPTION_MODES, useLinkCaptionMode } from '../utils/linkCaptions';
import { userDisplayName } from '../utils/userDisplay';

interface SettingsMenuProps {
  user: AuthUser | null;
  onOpenTokens: () => void;
  onLogout: () => void;
}


/** Account + appearance settings, shared by the sidebar popover and the phone drawer. */
const SettingsMenu = ({ user, onOpenTokens, onLogout }: SettingsMenuProps) => {
  const label = userDisplayName(user);
  const [captionMode, setCaptionMode] = useLinkCaptionMode();
  return (
    <>
      <div className="bookmark-account-menu-section">
        <p className="bookmark-account-menu-kicker">Signed in</p>
        <p className="bookmark-account-menu-value">{label}</p>
        {user?.email && user.email !== label && (
          <p className="bookmark-account-menu-meta">{user.email}</p>
        )}
      </div>
      <div className="bookmark-account-menu-section">
        <CanvasColorPicker />
        <DarkModeToggle className="bookmark-account-menu-action" />
        <SoundToggle className="bookmark-account-menu-action" />
        <div className="memex-settings-field">
          <p className="bookmark-account-menu-kicker" id="link-cards-label">
            Link cards
          </p>
          <div className="memex-segmented" role="radiogroup" aria-labelledby="link-cards-label">
            {LINK_CAPTION_MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={captionMode === option.value}
                className={captionMode === option.value ? 'is-active' : undefined}
                onClick={() => setCaptionMode(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="bookmark-account-menu-action" onClick={onOpenTokens}>
          Access tokens…
        </button>
        <button type="button" className="bookmark-account-menu-action" onClick={onLogout}>
          Log out
        </button>
      </div>
    </>
  );
};

export default SettingsMenu;
