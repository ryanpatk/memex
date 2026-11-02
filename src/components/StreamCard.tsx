import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { ItemType, Tag } from '@memex/core';
import { SHOW_TAGS_UI } from '../constants/modules';
import { dragAttrs } from '../utils/itemDrag';

const MAX_VISIBLE_TAGS = 3;

interface StreamCardProps {
  /** Drives the `memex-card--{type}` modifier. */
  type: ItemType;
  /** 24px leading slot in the header: favicon, type glyph, or checkbox. */
  leading: ReactNode;
  /** Muted caption beside the leading slot: host, date, due date… */
  meta?: ReactNode;
  metaTitle?: string;
  title: string;
  /** Optional clamped body text under the title (note excerpt, task detail). */
  excerpt?: string;
  tags: Tag[];
  /** Hover-revealed controls in the top-right corner. */
  actions?: ReactNode;
  /** Main activation (open, toggle select…). Omit for inert cards. */
  onActivate?: () => void;
  isSelected?: boolean;
  selectionMode?: boolean;
  isDone?: boolean;
  isDetailsActive?: boolean;
  /** Just created by the user (optimistic row) — plays the capture pop-in. */
  isNew?: boolean;
  /** `${type}:${id}` — lets the stream resolve modifier/range clicks. */
  itemKey?: string;
  /** Extra class names appended to the article. */
  className?: string;
  ariaLabel?: string;
}

/**
 * The text card for stream items. Anatomy (top → bottom): header (leading
 * slot + meta) → title → optional excerpt → tag footer, with hover actions
 * pinned top-right (a selection check replaces them in selection mode).
 * Notes and image-less links differ only in what they put in each slot;
 * image links use LinkPreviewCard, which shares this card's surface.
 */
const StreamCard = ({
  type,
  leading,
  meta,
  metaTitle,
  title,
  excerpt,
  tags,
  actions,
  onActivate,
  isSelected = false,
  selectionMode = false,
  isDone = false,
  isDetailsActive = false,
  isNew = false,
  itemKey,
  className,
  ariaLabel,
}: StreamCardProps) => {
  const interactive = typeof onActivate === 'function';
  const visibleTags = SHOW_TAGS_UI ? tags.slice(0, MAX_VISIBLE_TAGS) : [];

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (!interactive) return;
    // Ignore clicks that originated in nested controls (checkbox, actions)
    if ((event.target as HTMLElement).closest('button, a, input')) return;
    onActivate();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!interactive) return;
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate();
    }
  };

  const classes = [
    'memex-card',
    `memex-card--${type}`,
    isSelected ? 'is-selected' : '',
    selectionMode ? 'is-selection-mode' : '',
    isDone ? 'is-done' : '',
    isDetailsActive ? 'is-details-active' : '',
    isNew ? 'is-new' : '',
    interactive ? '' : 'is-static',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      className={classes}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive && selectionMode ? isSelected : undefined}
      aria-label={ariaLabel}
      data-item-key={itemKey}
      {...(itemKey ? dragAttrs(itemKey, title) : {})}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="memex-card-header">
        <span className="memex-card-favicon">{leading}</span>
        {meta !== undefined && meta !== null && (
          <span className="memex-card-sub" title={metaTitle}>
            {meta}
          </span>
        )}
      </div>

      <p className="memex-card-title" title={title}>
        {title}
      </p>

      {excerpt && <p className="memex-card-excerpt">{excerpt}</p>}

      {visibleTags.length > 0 && (
        <div className="memex-card-footer">
          {visibleTags.map((tag) => (
            <span
              key={tag.id}
              className="bookmark-list-row-tag"
              style={tag.color ? ({ '--edge': tag.color, color: tag.color } as CSSProperties) : undefined}
              title={tag.name}
            >
              {tag.name}
            </span>
          ))}
          {tags.length > MAX_VISIBLE_TAGS && (
            <span className="bookmark-list-row-tag is-more">
              +{tags.length - MAX_VISIBLE_TAGS}
            </span>
          )}
        </div>
      )}

      {selectionMode ? (
        <span className={`memex-select-check${isSelected ? ' is-on' : ''}`} aria-hidden="true">
          {isSelected && <Check />}
        </span>
      ) : (
        actions && <div className="memex-card-actions">{actions}</div>
      )}
    </article>
  );
};

export default StreamCard;
