import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { dragAttrs } from '../../utils/itemDrag';

interface StreamRowProps {
  leading: ReactNode;
  title: string;
  meta?: ReactNode;
  thumbnail?: string | null;
  actions?: ReactNode;
  onActivate?: () => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  isNew?: boolean;
  ariaLabel?: string;
  /** `${type}:${id}` — lets the stream resolve modifier/range clicks. */
  itemKey?: string;
}

/** One line of the reading-list view: icon · title / meta · thumbnail · hover actions. */
const StreamRow = ({
  leading,
  title,
  meta,
  thumbnail,
  actions,
  onActivate,
  selectionMode = false,
  isSelected = false,
  isNew = false,
  ariaLabel,
  itemKey,
}: StreamRowProps) => {
  const [thumbFailed, setThumbFailed] = useState(false);

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button, a, input')) return;
    onActivate?.();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate?.();
    }
  };

  return (
    <div
      className={`memex-row${isSelected ? ' is-selected' : ''}${isNew ? ' is-new' : ''}`}
      role={onActivate ? 'button' : undefined}
      tabIndex={onActivate ? 0 : undefined}
      aria-pressed={onActivate && selectionMode ? isSelected : undefined}
      aria-label={ariaLabel}
      data-item-key={itemKey}
      {...(itemKey ? dragAttrs(itemKey, title) : {})}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {selectionMode ? (
        <span
          className={`memex-select-check memex-row-select${isSelected ? ' is-on' : ''}`}
          aria-hidden="true"
        >
          {isSelected && <Check />}
        </span>
      ) : (
        <span className="memex-row-leading">{leading}</span>
      )}
      <span className="memex-row-text">
        <span className="memex-row-title">{title}</span>
        {meta && <span className="memex-row-meta">{meta}</span>}
      </span>
      {thumbnail && !thumbFailed && (
        <span className="memex-row-thumb" aria-hidden="true">
          <img src={thumbnail} alt="" loading="lazy" onError={() => setThumbFailed(true)} />
        </span>
      )}
      {actions && !selectionMode && <span className="memex-row-actions">{actions}</span>}
    </div>
  );
};

export default StreamRow;
