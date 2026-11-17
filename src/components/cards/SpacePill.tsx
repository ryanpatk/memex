import type { CSSProperties, DragEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check, Plus } from 'lucide-react';

interface SpacePillProps {
  name: string;
  color?: string;
  /** Filled with the space's colour (the chosen filter). */
  selected?: boolean;
  /** Ink pill (the “All” pill when nothing is chosen). */
  on?: boolean;
  /** No dot: “All”, “Unfiled”. */
  plain?: boolean;
  size?: 'default' | 'small' | 'xs';
  /** Drop/add target states while dragging or selecting. */
  target?: 'idle' | 'over' | 'all-in' | 'added';
  to?: string;
  onClick?: () => void;
  ariaLabel?: string;
  ariaPressed?: boolean;
  dropHandlers?: {
    onDragEnter: (event: DragEvent) => void;
    onDragOver: (event: DragEvent) => void;
    onDragLeave: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
  };
  trailing?: ReactNode;
  disabled?: boolean;
}

/**
 * A space as a round cartridge pill (s03): a coloured dot and the name; the
 * chosen pill fills with its colour. As a drop or add target the dot turns
 * into a “+” disc, swells while something is over it, ticks after an add,
 * and steps back when the space already holds everything (“All in”).
 */
const SpacePill = ({
  name,
  color,
  selected = false,
  on = false,
  plain = false,
  size = 'default',
  target,
  to,
  onClick,
  ariaLabel,
  ariaPressed,
  dropHandlers,
  trailing,
  disabled,
}: SpacePillProps) => {
  const className = [
    'mc-pill',
    plain ? 'is-plain' : '',
    selected ? 'is-selected' : '',
    on ? 'is-on' : '',
    size === 'small' ? 'is-small' : size === 'xs' ? 'is-xs' : '',
    target ? 'is-target' : '',
    target === 'over' ? 'is-drop' : '',
    target === 'all-in' ? 'is-all-in' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const style = color ? ({ '--c': color } as CSSProperties) : undefined;
  const content = (
    <>
      {!plain && (
        <span className="mc-pill-dot" aria-hidden="true">
          {target === 'added' ? <Check /> : target && target !== 'all-in' ? <Plus /> : null}
        </span>
      )}
      <span className="mc-pill-name" translate="no">
        {name}
      </span>
      {target === 'all-in' && <em>All in</em>}
      {trailing}
    </>
  );
  if (to && !target) {
    return (
      <Link to={to} className={className} style={style} aria-label={ariaLabel} aria-current={selected || on ? 'true' : undefined} {...dropHandlers}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      style={style}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      disabled={disabled}
      {...dropHandlers}
    >
      {content}
    </button>
  );
};

export default SpacePill;
