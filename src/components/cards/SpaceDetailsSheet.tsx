import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { MC_SPACE_COLOR_VALUES, buildSpaceColors, chosenSpaceColor, type ItemType, type Profile } from '@memex/core';
import { LIBRARY_PATH } from '../../constants/modules';
import { useDeleteProfile, useProfiles, useUpdateProfile } from '../../hooks/useProfiles';
import { useSelfMessages } from '../../hooks/useSelfMessages';
import { useSetSpaceColor } from '../../hooks/useSetSpaceColor';
import { hasColorColumn, readLocalSpaceColors, subscribeLocalSpaceColors } from '../../utils/spaceColorFallback';
import { HANDLES_ERRORS } from '../../utils/mutationErrors';
import { cue } from '../../utils/sound';
import { SpaceColorPicker } from './NewSpaceSheet';
import Sheet from './Sheet';

interface SpaceDetailsSheetProps {
  space: Profile;
  open: boolean;
  onClose: () => void;
  /** Item totals for this space. */
  typeTotals: Record<ItemType, number>;
  onFeedback: (message: string) => void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Space details (d30): rename, recolour, see what it holds, delete it.
 * Delete asks once more in place (no browser confirm); deleting keeps the
 * space's cards, and jots written in it go with it.
 */
const SpaceDetailsSheet = ({ space, open, onClose, typeTotals, onFeedback }: SpaceDetailsSheetProps) => {
  const navigate = useNavigate();
  const updateProfile = useUpdateProfile(HANDLES_ERRORS);
  const deleteProfile = useDeleteProfile(HANDLES_ERRORS);
  const setSpaceColor = useSetSpaceColor();
  const { data: profiles } = useProfiles();
  const { messages } = useSelfMessages(space.id);
  const local = useSyncExternalStore(subscribeLocalSpaceColors, () => readLocalSpaceColors()[space.id] ?? null, () => null);
  const inputRef = useRef<HTMLInputElement>(null);

  const savedColor = useMemo(
    () => chosenSpaceColor(space) ?? (hasColorColumn(space) ? null : local),
    [local, space],
  );
  const [name, setName] = useState(space.name);
  const [color, setColor] = useState<string | null>(savedColor);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(space.name);
    setColor(savedColor);
    setConfirming(false);
    setError(null);
    // Only on open: edits in progress aren't reset by a refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const trimmed = name.trim();
  const nameMissing = trimmed.length === 0;
  const changed = trimmed !== space.name || color !== savedColor;
  // What “Automatic” gives: the palette colour by creation order, ignoring any chosen colour
  const automatic = useMemo(
    () =>
      buildSpaceColors(
        (profiles ?? [space]).map((p) => ({ ...p, color: null })),
        MC_SPACE_COLOR_VALUES,
      ).get(space.id) ?? MC_SPACE_COLOR_VALUES[0],
    [profiles, space],
  );

  const save = async () => {
    if (nameMissing) {
      inputRef.current?.focus();
      return;
    }
    if (!changed) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (trimmed !== space.name) await updateProfile.mutateAsync({ id: space.id, updates: { name: trimmed } });
      let where: 'database' | 'browser' | null = null;
      if (color !== savedColor) where = await setSpaceColor(space, color);
      cue('confirm');
      onFeedback(where === 'browser' ? `Saved. The colour is kept in this browser until the database has a colour column.` : `Saved “${trimmed}”.`);
      onClose();
    } catch (err) {
      cue('error');
      console.error('Failed to save space:', err);
      setError('Couldn’t save the space. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setError(null);
    try {
      await deleteProfile.mutateAsync(space.id);
      cue('dismiss');
      onFeedback(`Deleted “${space.name}”. Its cards stay in Cards.`);
      onClose();
      navigate(LIBRARY_PATH, { replace: true });
    } catch (err) {
      cue('error');
      console.error('Failed to delete space:', err);
      setError('Couldn’t delete the space. Check your connection and try again.');
    }
  };

  const jotCount = messages.length;
  const holds = [
    plural(typeTotals.link, 'link'),
    plural(typeTotals.note, 'note'),
    plural(typeTotals.task, 'task'),
    plural(jotCount, 'jot'),
  ].join(' · ');

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={space.name}
      width={720}
      footer={
        confirming ? (
          <>
            <p className="mc-lab mc-sd-confirm" role="alert">
              Delete “{space.name}”? Its cards stay; {plural(jotCount, 'jot')} written here go with it.
            </p>
            <div className="mc-sheet-foot-actions">
              <button type="button" className="mc-btn is-quiet" onClick={() => setConfirming(false)}>
                Keep it
              </button>
              <button
                type="button"
                className="mc-btn is-danger"
                onClick={() => void remove()}
                aria-busy={deleteProfile.isPending || undefined}
                disabled={deleteProfile.isPending}
              >
                Delete for good
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mc-sd-delete">
              <button type="button" className="mc-btn is-danger is-small" onClick={() => setConfirming(true)}>
                Delete space
              </button>
              <span className="mc-lab">Deleting a space keeps its cards.</span>
            </div>
            <button
              type="button"
              className="mc-btn is-primary"
              onClick={() => void save()}
              aria-busy={saving || undefined}
              disabled={saving}
            >
              Save
            </button>
          </>
        )
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="mc-flab" htmlFor="mc-space-name" style={{ marginTop: 0 }}>
          Name
        </label>
        <input
          ref={inputRef}
          id="mc-space-name"
          name="space-name"
          className="mc-inp"
          value={name}
          maxLength={80}
          autoComplete="off"
          aria-invalid={nameMissing || undefined}
          onChange={(event) => setName(event.target.value)}
        />
        {nameMissing && <p className="mc-ferr">Give the space a name.</p>}
        <p className="mc-flab" id="mc-space-colour">
          Colour <span className="mc-color-note">· A picks one for you</span>
        </p>
        <SpaceColorPicker value={color} onChange={setColor} automatic={automatic} labelId="mc-space-colour" />
        <p className="mc-flab">Holds</p>
        <p className="mc-body">{holds}</p>
        {error && (
          <p className="mc-ferr" role="alert">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
};

export default SpaceDetailsSheet;
