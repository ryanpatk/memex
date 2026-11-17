import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Check, Pin, Sparkles } from 'lucide-react';
import { dragAttrs } from '../../utils/itemDrag';
import LabelStrip, { type CardLabel } from './LabelStrip';

export type MemoryCardKind = 'picture' | 'link' | 'note' | 'jot' | 'task';

export interface MemoryCardProps {
  kind: MemoryCardKind;
  title: string;
  label: CardLabel;
  /** Right side of the label strip: host, “note”, “task” or a time. */
  meta?: string;
  /** `${type}:${id}`: lets the page resolve ⌘/⇧-clicks, ⌘A and drags. */
  itemKey?: string;
  onActivate?: () => void;
  selected?: boolean;
  selectionMode?: boolean;
  /** Just written: plays the card-write drop (s14). */
  isNew?: boolean;
  /** Pinned to the top of its space. */
  pinned?: boolean;
  /** Written by an agent: the client's name for the badge. */
  agent?: string | null;
  /** Above the body: the picture (picture cards) or favicon block (links). */
  top?: ReactNode;
  excerpt?: string;
  /** Leading control in the body row (the task check). */
  leading?: ReactNode;
  /** Under the title (the task's due chip). */
  below?: ReactNode;
  /** Hover-revealed round buttons in the top-right corner. */
  actions?: ReactNode;
  ariaLabel?: string;
  done?: boolean;
  /** Ref for the root (picture cards hold their size while on screen). */
  rootRef?: (node: HTMLElement | null) => void;
}

/**
 * One body for every save (s05): a 28px card, an optional 16px-inset picture,
 * a 26px title and the label strip naming its space. Text-only cards wear the
 * space's colour: jots fill with it, notes tint from it. States (s06): hover
 * lift, press, focus ring, selected ring with a tick, card-write drop.
 */
const MemoryCard = ({
  kind,
  title,
  label,
  meta,
  itemKey,
  onActivate,
  selected = false,
  selectionMode = false,
  isNew = false,
  pinned = false,
  agent,
  top,
  excerpt,
  leading,
  below,
  actions,
  ariaLabel,
  done = false,
  rootRef,
}: MemoryCardProps) => {
  const interactive = typeof onActivate === 'function';

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (!interactive) return;
    if ((event.target as HTMLElement).closest('button, a, input')) return;
    onActivate();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!interactive || event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate();
    }
  };

  const textKind = kind === 'note' || kind === 'jot';
  const classes = [
    'mc-card',
    `is-${kind}`,
    kind === 'link' ? 'is-plain' : '',
    textKind && !label.name ? 'is-unfiled-card' : '',
    selected ? 'is-selected' : '',
    isNew ? 'is-new' : '',
    done ? 'is-done' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      ref={rootRef}
      className={classes}
      style={label.color ? ({ '--c': label.color } as CSSProperties) : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive && selectionMode ? selected : undefined}
      aria-label={ariaLabel}
      data-item-key={itemKey}
      {...(itemKey ? dragAttrs(itemKey, title) : {})}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {pinned && (
        <span className="mc-pin" aria-label="Pinned" role="img">
          <Pin aria-hidden="true" />
        </span>
      )}
      {top}
      {kind === 'task' ? (
        <div className="mc-card-task">
          {leading}
          <div>
            {agent && <AgentBadge name={agent} />}
            <p className="mc-card-title">{title}</p>
            {below}
          </div>
        </div>
      ) : (
        <div className="mc-card-body">
          {agent && textKind && <AgentBadge name={agent} />}
          <p className="mc-card-title">{title}</p>
          {excerpt && <p className="mc-card-excerpt">{excerpt}</p>}
          {below}
        </div>
      )}
      {agent && !textKind && kind !== 'task' && <AgentBadge name={agent} />}
      <LabelStrip label={label} meta={meta} />
      {selectionMode ? (
        <span className={`mc-tick${selected ? '' : ' is-off'}`} aria-hidden="true">
          <Check />
        </span>
      ) : (
        actions && <div className="mc-card-hover">{actions}</div>
      )}
    </article>
  );
};

export const AgentBadge = ({ name }: { name: string }) => (
  <span className="mc-agent" title={`Written by ${name}`}>
    <Sparkles aria-hidden="true" width={16} height={16} />
    <span translate="no">{name}</span>
  </span>
);

export default MemoryCard;
