import { useCallback, type HTMLAttributes, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { autoUpdate, useFloating, type Placement } from '@floating-ui/react-dom';
import { popoverHost, popoverMiddleware } from './popoverPlacement';

interface PopoverProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The element it opens from (a ••• button, a field). */
  anchor: HTMLElement | null;
  open: boolean;
  /** The preferred side and alignment; it flips and slides when that doesn't fit. */
  placement?: Placement;
  /** Space between it and the anchor, px. */
  gap?: number;
  /** The popover element itself (for focus handling and outside-click checks). */
  popoverRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}

const assignRef = <T,>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
};

/**
 * Every popover and menu in memex sits on this: rendered in a portal (the
 * end of <body>, or the open sheet it belongs to; popoverPlacement.ts) on the
 * popover layer (`--mc-z-popover`, above the grid, the top bar and the
 * selection bar), so no parent's overflow, transform or stacking context can
 * clip or cover it. Floating UI places it: the preferred side, flipped or
 * slid to stay 16px inside the window, shrunk with its content scrolling if
 * there's still no room, and re-placed on scroll and resize (autoUpdate). It
 * hides while its anchor is scrolled out of view.
 *
 * Behaviour (keys, focus, closing) stays with the caller: Menu, ViewPanel,
 * the Journal's entry menus and the composers' space pickers.
 */
const Popover = ({ anchor, open, placement = 'bottom-end', gap, popoverRef, className, style, children, ...rest }: PopoverProps) => {
  const { refs, floatingStyles, middlewareData, isPositioned, placement: finalPlacement } = useFloating({
    open,
    placement,
    strategy: 'fixed',
    // left/top, not a transform: entry animations (mc-sheet-in) animate transform
    transform: false,
    elements: { reference: anchor },
    middleware: popoverMiddleware({ gap }),
    whileElementsMounted: autoUpdate,
  });

  const setFloating = refs.setFloating;
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      setFloating(node);
      assignRef(popoverRef, node);
    },
    [popoverRef, setFloating],
  );

  if (!open || !anchor) return null;
  const hidden = Boolean(middlewareData.hide?.referenceHidden);
  return createPortal(
    <div
      {...rest}
      ref={setRef}
      data-mc-popover=""
      data-placement={finalPlacement}
      className={`mc-popover${className ? ` ${className}` : ''}`}
      style={{
        ...floatingStyles,
        // Older rules on these classes anchored them with right/bottom/margins
        right: 'auto',
        bottom: 'auto',
        margin: 0,
        zIndex: 'var(--mc-z-popover)',
        // Invisible (still focusable) until the first placement lands, so it never flashes at 0,0
        opacity: isPositioned ? undefined : 0,
        visibility: hidden ? 'hidden' : undefined,
        ...style,
      }}
    >
      {children}
    </div>,
    popoverHost(anchor, document.body),
  );
};

export default Popover;
