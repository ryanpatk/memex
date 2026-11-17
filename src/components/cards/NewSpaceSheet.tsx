import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MC_SPACE_COLORS, MC_SPACE_COLOR_VALUES } from '@memex/core';
import { spacePath } from '../../constants/modules';
import { useCreateProfile, useProfiles } from '../../hooks/useProfiles';
import { hasColorColumn, writeLocalSpaceColor } from '../../utils/spaceColorFallback';
import { HANDLES_ERRORS } from '../../utils/mutationErrors';
import { cue } from '../../utils/sound';
import { Swatch } from './Controls';
import Sheet from './Sheet';

export interface NewSpaceSheetProps {
  open: boolean;
  onClose: () => void;
  onFeedback?: (message: string) => void;
  /** Called with the new space's id once it exists (default: navigate into it). */
  onCreated?: (spaceId: string) => void;
}

interface SpaceColorPickerProps {
  /** The chosen `#rrggbb`, or null for automatic. */
  value: string | null;
  onChange: (color: string | null) => void;
  /** The colour “Automatic” would give, shown on its swatch. */
  automatic: string;
  labelId: string;
}

/**
 * The eight Memory Cards space colours as one radio group (decision x11 B),
 * led by “Automatic” (the colour memex would pick by creation order). ←/→
 * move the choice, like any radio group.
 */
export const SpaceColorPicker = ({ value, onChange, automatic, labelId }: SpaceColorPickerProps) => {
  const options: (string | null)[] = [null, ...MC_SPACE_COLOR_VALUES];
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const index = options.indexOf(value);
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    onChange(options[(index + delta + options.length) % options.length]);
    const group = event.currentTarget;
    requestAnimationFrame(() => group.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  };
  return (
    <div className="mc-colors" role="radiogroup" aria-labelledby={labelId} onKeyDown={onKeyDown}>
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        tabIndex={value === null ? 0 : -1}
        className="mc-sw mc-color-auto"
        style={{ '--c': automatic } as CSSProperties}
        aria-label="Automatic colour"
        title="Automatic"
        onClick={() => onChange(null)}
      >
        <span aria-hidden="true">A</span>
      </button>
      {MC_SPACE_COLORS.map((color) => (
        <span key={color.key} className="mc-color-cell">
          <Swatch color={color.value} label={color.label} checked={value === color.value} onSelect={() => onChange(color.value)} />
        </span>
      ))}
    </div>
  );
};

/**
 * New space (d29): a name and a colour. The colour goes to `profiles.color`;
 * without that column (migration not applied) the space is created anyway and
 * the colour is kept in this browser (utils/spaceColorFallback.ts).
 */
const NewSpaceSheet = ({ open, onClose, onFeedback, onCreated }: NewSpaceSheetProps) => {
  const navigate = useNavigate();
  const { data: spaces } = useProfiles();
  const createProfile = useCreateProfile(HANDLES_ERRORS);
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setColor(null);
    setError(null);
    setTouched(false);
  }, [open]);

  const automatic = MC_SPACE_COLOR_VALUES[(spaces?.length ?? 0) % MC_SPACE_COLOR_VALUES.length];
  const trimmed = name.trim();
  const nameMissing = touched && trimmed.length === 0;

  const create = async () => {
    setTouched(true);
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }
    if (createProfile.isPending) return;
    setError(null);
    try {
      const created = await createProfile.mutateAsync(color ? { name: trimmed, color } : { name: trimmed });
      if (color && created && !hasColorColumn(created)) writeLocalSpaceColor(created.id, color);
      cue('confirm');
      onFeedback?.(`Created “${trimmed}”.`);
      onClose();
      if (onCreated) onCreated(created.id);
      else navigate(spacePath(created.id));
    } catch (err) {
      cue('error');
      console.error('Failed to create space:', err);
      setError('Couldn’t create the space. Check your connection and try again.');
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New space"
      width={720}
      initialFocus={inputRef}
      footer={
        <>
          <button type="button" className="mc-btn is-quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="mc-btn is-primary"
            onClick={() => void create()}
            aria-busy={createProfile.isPending || undefined}
            disabled={createProfile.isPending}
          >
            Create
          </button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <label className="mc-flab" htmlFor="mc-new-space-name" style={{ marginTop: 0 }}>
          Name
        </label>
        <input
          ref={inputRef}
          id="mc-new-space-name"
          name="space-name"
          className="mc-inp"
          value={name}
          maxLength={80}
          placeholder="Garden, Kyoto trip, Reading…"
          autoComplete="off"
          aria-invalid={nameMissing || undefined}
          aria-describedby={nameMissing ? 'mc-new-space-error' : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        {nameMissing && (
          <p className="mc-ferr" id="mc-new-space-error" role="alert">
            Give the space a name.
          </p>
        )}
        <p className="mc-flab" id="mc-new-space-colour">
          Colour <span className="mc-color-note">· A picks one for you</span>
        </p>
        <SpaceColorPicker value={color} onChange={setColor} automatic={automatic} labelId="mc-new-space-colour" />
        {error && (
          <p className="mc-ferr" role="alert">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
};

export default NewSpaceSheet;
