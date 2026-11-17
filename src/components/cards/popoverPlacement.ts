import { flip, hide, offset, shift, size, type Middleware } from '@floating-ui/react-dom';

/*
 * How every popover and menu is placed (components/cards/Popover.tsx), kept
 * apart from React so it can be unit-tested: open on the preferred side of
 * the trigger, flip to the other side when it doesn't fit, slide along to
 * stay `margin` px inside the window, and if it still doesn't fit, shrink to
 * the room there is (its content scrolls inside).
 */

/** Space kept between a popover and the window edges. */
export const POPOVER_MARGIN = 16;
/** Space between a popover and its trigger. */
export const POPOVER_GAP = 12;
/** A popover never shrinks below this height to fit; past this it flips or scrolls. */
export const POPOVER_MIN_HEIGHT = 120;

/**
 * The size limits for the room the window leaves (Floating UI's `size`
 * middleware): published as CSS variables so each popover's own caps in CSS
 * still apply (`max-height: min(640px, var(--mc-pop-max-h))`).
 */
export const fitToRoom = (availableWidth: number, availableHeight: number) => ({
  maxWidth: Math.max(0, Math.floor(availableWidth)),
  maxHeight: Math.max(POPOVER_MIN_HEIGHT, Math.floor(availableHeight)),
});

export const popoverMiddleware = ({ gap = POPOVER_GAP, margin = POPOVER_MARGIN } = {}): Middleware[] => [
  offset(gap),
  flip({ padding: margin, crossAxis: false }),
  shift({ padding: margin }),
  size({
    padding: margin,
    apply({ availableWidth, availableHeight, elements }) {
      const { maxWidth, maxHeight } = fitToRoom(availableWidth, availableHeight);
      elements.floating.style.setProperty('--mc-pop-max-w', `${maxWidth}px`);
      elements.floating.style.setProperty('--mc-pop-max-h', `${maxHeight}px`);
    },
  }),
  // A trigger scrolled fully out of sight takes its popover with it
  hide(),
];

/** What `closest` needs, so the choice of portal root is testable without a DOM. */
interface ClosestCapable {
  closest(selector: string): unknown;
}

/**
 * Where a popover's portal goes. Normally the end of <body>, above
 * everything on the page. Inside an open modal sheet (a <dialog> in the
 * browser's top layer, which makes the rest of the page inert) it goes into
 * that dialog instead, so it stays clickable and inside the sheet's focus
 * trap; inside another popover (a menu in the View panel) it nests in that
 * popover, so clicks in it still count as inside the outer one. Position is
 * `fixed` either way, so no ancestor's overflow clips it.
 */
export const POPOVER_HOST_SELECTOR = 'dialog[open], [data-mc-popover]';

export const popoverHost = <T>(anchor: ClosestCapable | null, body: T): T => {
  const host = anchor?.closest(POPOVER_HOST_SELECTOR);
  return (host as T | null | undefined) ?? body;
};
