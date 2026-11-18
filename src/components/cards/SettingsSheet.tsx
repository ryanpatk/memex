import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useDarkMode } from '../../hooks/useDarkMode';
import { useSoundPreference } from '../../hooks/useSoundPreference';
import { useCanvasColor } from '../../hooks/useCanvasColor';
import { useApiTokens } from '../../hooks/useApiTokens';
import { agentTokenStatus, useAgentTokens } from '../../hooks/useAgentTokens';
import { useSession } from '../../context/SessionContext';
import { repository } from '../../data/repository';
import { setCardsFont, useCardsFont, type CardsFont } from '../../utils/cardsFont';
import { userDisplayName } from '../../utils/userDisplay';
import { useAppStore } from '../../store';
import { useProfiles } from '../../hooks/useProfiles';
import Sheet from './Sheet';
import { Swatch, Switch, ToggleGroup } from './Controls';
import AgentTokensSheet from './AgentTokensSheet';
import ApiTokensSheet from './ApiTokensSheet';

const FONT_OPTIONS: readonly { value: CardsFont; label: string }[] = [
  { value: 'rounded', label: 'Rounded' },
  { value: 'plex', label: 'Plex' },
];

/**
 * Settings (d31): three tiles (Dark mode, Sounds, Font), the canvas
 * swatches, rows into Access tokens and Agent tokens, and the account with
 * Sign out. Card captions are gone: picture cards always caption below
 * (decision 12).
 */
const SettingsSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const setEditSpacesOpen = useAppStore((state) => state.setEditSpacesOpen);
  const { data: spaces } = useProfiles();
  const navigate = useNavigate();
  const { session } = useSession();
  const user = session?.user ?? null;
  const { isDark, toggleDarkMode } = useDarkMode();
  const sound = useSoundPreference();
  const font = useCardsFont();
  const { colorId, setColorId, options } = useCanvasColor();
  const { tokens: apiTokens } = useApiTokens(open);
  const { tokens: agentTokens } = useAgentTokens(open);
  const liveAgents = agentTokens.filter((token) => agentTokenStatus(token) === 'active').length;
  const [sub, setSub] = useState<'api' | 'agent' | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await repository.auth.signOut();
      onClose();
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
      setSigningOut(false);
    }
  };

  return (
    <>
      <Sheet titleSize="h2" open={open} onClose={onClose} title="Settings" width={760}>
        <div className="mc-settings-tiles">
          <div className="mc-stile">
            <h3 className="mc-h3" id="mc-set-dark">
              Dark mode
            </h3>
            <Switch checked={isDark} onChange={toggleDarkMode} label="Dark mode" />
            <p className="mc-lab">{isDark ? 'On on this device' : 'Off on this device'}</p>
          </div>
          <div className="mc-stile">
            <h3 className="mc-h3">Sounds</h3>
            <Switch checked={sound.enabled} onChange={(on) => sound.setEnabled(on)} label="Sounds" />
            <p className="mc-lab">Little clicks when you save, tick and file</p>
          </div>
          <div className="mc-stile">
            <h3 className="mc-h3">Font</h3>
            <ToggleGroup label="Heading font" value={font} options={FONT_OPTIONS} onChange={setCardsFont} />
          </div>
        </div>

        <div className="mc-setrow mc-set-canvas">
          <span id="mc-set-canvas">Canvas</span>
          <div className="mc-swatches" role="radiogroup" aria-labelledby="mc-set-canvas">
            {options.map((option) => (
              <Swatch
                key={option.id}
                small
                color={option.source ?? 'var(--mc-line)'}
                label={option.label}
                checked={colorId === option.id}
                onSelect={() => setColorId(option.id)}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          className="mc-setrow"
          onClick={() => {
            onClose();
            setEditSpacesOpen(true);
          }}
        >
          Spaces: order and hiding
          <small>
            {(spaces ?? []).length > 0 && <span>{(spaces ?? []).length}</span>}
            <ChevronRight aria-hidden="true" />
          </small>
        </button>
        <button type="button" className="mc-setrow" onClick={() => setSub('api')}>
          Access tokens
          <small>
            {apiTokens.length > 0 && <span>{apiTokens.length}</span>}
            <ChevronRight aria-hidden="true" />
          </small>
        </button>
        <button type="button" className="mc-setrow" onClick={() => setSub('agent')}>
          Agent tokens
          <small>
            {liveAgents > 0 && <span>{liveAgents}</span>}
            <ChevronRight aria-hidden="true" />
          </small>
        </button>
        <div className="mc-setrow mc-set-account">
          <span className="mc-set-who" translate="no">
            {user?.email ?? userDisplayName(user)}
          </span>
          <button type="button" className="mc-btn is-small" aria-busy={signingOut || undefined} disabled={signingOut} onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </Sheet>
      <ApiTokensSheet open={open && sub === 'api'} onClose={() => setSub(null)} />
      <AgentTokensSheet open={open && sub === 'agent'} onClose={() => setSub(null)} />
    </>
  );
};

export default SettingsSheet;
