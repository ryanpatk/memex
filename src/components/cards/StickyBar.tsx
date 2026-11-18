import type { ReactNode, RefObject } from 'react';
import { ArrowUp } from 'lucide-react';
import PinnedButton from './PinnedButton';
import { scrollShellToTop, useScrolledPast } from './stickyScroll';

const numberFormat = new Intl.NumberFormat();

interface StickyBarProps {
  /** The element whose scrolling out of view brings the bar in (the pill row, or the hero). */
  watch: RefObject<HTMLElement | null>;
  /** The page's name, on the back-to-top chip (“Everything”, “Kitchen reno”, “Tasks”). */
  title: string;
  count?: number;
  /** The compact space pill row. */
  pills: ReactNode;
}

/**
 * The compact sticky bar (design A, docs/spaces-row.md) on Cards, a space's
 * board and Tasks: once the page's own pills (or hero) scroll away, one slim
 * bar sticks to the top with “↑ <page>” (back to the top), the space pills
 * in their compact size with More, and the gold Pinned button. The top bar's
 * words, Inbox and account scroll away with the page; ↑ brings them back.
 * The bar stays in the DOM (sticky, zero height) and slides in and out, so
 * nothing below it moves.
 */
const StickyBar = ({ watch, title, count, pills }: StickyBarProps) => {
  const shown = useScrolledPast(watch);
  return (
    <div className={`mc-stick${shown ? ' is-shown' : ''}`}>
      <div className="mc-stick-bar" role="region" aria-label={`${title} bar`} aria-hidden={!shown} inert={!shown}>
        <button type="button" className="mc-stick-top" onClick={(event) => scrollShellToTop(event.currentTarget)} aria-label={`Back to the top of ${title}`}>
          <span className="mc-stick-top-disc" aria-hidden="true">
            <ArrowUp />
          </span>
          <span className="mc-stick-top-name" translate="no">
            {title}
          </span>
          {count !== undefined && <sup aria-hidden="true">{numberFormat.format(count)}</sup>}
        </button>
        <span className="mc-stick-sep" aria-hidden="true" />
        <div className="mc-stick-pills">{pills}</div>
        <PinnedButton shortcuts={false} />
      </div>
    </div>
  );
};

export default StickyBar;
