import { useMemo, useState, type CSSProperties } from 'react';
import { Check, Plus } from 'lucide-react';
import type { ToastAction } from '../../hooks/useFeedbackToast';
import { useProfiles } from '../../hooks/useProfiles';
import { useSpaceColors } from '../../hooks/useSpaceColors';
import { useAddToSpace } from '../../hooks/useAddToSpace';
import { useRemoveFromSpace } from '../../hooks/useRemoveFromSpace';
import { useCardLabels } from '../../hooks/useCardLabels';
import { isFileableKey } from '../../utils/itemDrag';
import { spaceHoldsAll, spacesHoldingAny, tileAction } from '../space/spaceFiling';
import NewSpaceSheet from './NewSpaceSheet';
import Sheet from './Sheet';

export interface MoveSheetProps {
  open: boolean;
  onClose: () => void;
  /** Item keys to file (`link:<id>`, `note:<id>`, `task:<id>`, `jot:<id>`). */
  itemKeys: string[];
  onFeedback: (message: string, action?: ToastAction) => void;
  title?: string;
}

/**
 * Move to a space (d14): every space as a full-colour tile. A tile that
 * already holds every given card is ticked (“All in”); pressing it takes them
 * out, pressing any other tile adds them. Every press toasts with Undo
 * (useAddToSpace / useRemoveFromSpace). A dashed tile makes a new space and
 * files the cards there. A card can live in more than one space; a jot lives
 * in one, so filing a jot moves it.
 */
const MoveSheet = ({ open, onClose, itemKeys, onFeedback, title }: MoveSheetProps) => {
  const { data: profiles } = useProfiles();
  const colors = useSpaceColors();
  const { spacesOf } = useCardLabels();
  const addToSpace = useAddToSpace(onFeedback);
  const removeFromSpace = useRemoveFromSpace(onFeedback);
  const [creating, setCreating] = useState(false);

  const keys = useMemo(() => itemKeys.filter(isFileableKey), [itemKeys]);
  const spaces = profiles ?? [];
  const holds = (spaceId: string) => spaceHoldsAll(keys, spacesOf, spaceId);
  const anyFiled = spacesHoldingAny(keys, spacesOf).length > 0;

  const heading =
    title ?? (keys.length === 1 ? 'Move this card to…' : `Move ${keys.length} cards to…`);

  const press = (spaceId: string) => {
    const action = tileAction(keys, spacesOf, spaceId);
    if (action === 'remove') void removeFromSpace(spaceId, keys);
    else if (action === 'add') void addToSpace(spaceId, keys);
  };

  const takeOutOfAll = () => spacesHoldingAny(keys, spacesOf).forEach((id) => void removeFromSpace(id, keys));

  return (
    <>
      <Sheet
        open={open && !creating}
        onClose={onClose}
        title={heading}
        width={800}
        footer={
          <>
            <button type="button" className="mc-btn is-quiet" onClick={takeOutOfAll} disabled={!anyFiled}>
              Take out of all
            </button>
            <button type="button" className="mc-btn is-primary" onClick={onClose}>
              Done
            </button>
          </>
        }
      >
        <p className="mc-body mc-move-sub">A card can live in more than one space.</p>
        <div className="mc-move-grid" role="group" aria-label="Spaces">
          {spaces.map((space) => {
            const allIn = holds(space.id);
            return (
              <button
                key={space.id}
                type="button"
                className="mc-tile mc-move-tile"
                style={{ '--c': colors.get(space.id) } as CSSProperties}
                aria-pressed={allIn}
                aria-label={allIn ? `${space.name}: all in. Press to take out` : `Add to ${space.name}`}
                onClick={() => press(space.id)}
              >
                {allIn && (
                  <>
                    <small>All in</small>
                    <span className="mc-tile-check" aria-hidden="true">
                      <Check />
                    </span>
                  </>
                )}
                <span className="mc-tile-name" translate="no">
                  {space.name}
                </span>
              </button>
            );
          })}
          <button type="button" className="mc-tile is-add mc-move-tile" onClick={() => setCreating(true)}>
            <span className="mc-move-new">
              <Plus aria-hidden="true" /> New space
            </span>
          </button>
        </div>
      </Sheet>
      <NewSpaceSheet
        open={open && creating}
        onClose={() => setCreating(false)}
        onCreated={(spaceId) => {
          setCreating(false);
          if (keys.length) void addToSpace(spaceId, keys);
        }}
      />
    </>
  );
};

export default MoveSheet;
