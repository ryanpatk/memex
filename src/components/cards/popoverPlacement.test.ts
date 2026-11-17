import { computePosition, type Platform, type ElementRects, type Rect } from '@floating-ui/core';
import { describe, expect, it } from 'vitest';
import { POPOVER_GAP, POPOVER_MARGIN, POPOVER_MIN_HEIGHT, fitToRoom, popoverHost, popoverMiddleware } from './popoverPlacement';

/*
 * Placement runs Floating UI's own algorithm against a fake window, so these
 * check where a popover lands without a browser: near each edge it flips or
 * slides to stay inside the margin, and with no room either way it shrinks.
 * (scripts/check-popovers.mjs checks the real app in headless Chrome.)
 */

const VIEW = { width: 1280, height: 800 };

/** A platform with one fixed-size floating element inside a VIEW-sized window. */
const fakePlatform = (floating: { width: number; height: number }): Platform => ({
  getElementRects: ({ reference }) => ({ reference: reference as unknown as Rect, floating: { x: 0, y: 0, ...floating } }) as ElementRects,
  getClippingRect: () => ({ x: 0, y: 0, ...VIEW }),
  getDimensions: () => floating,
});

/** A fake element for the size middleware to write its CSS variables to. */
const fakeFloating = () => {
  const vars: Record<string, string> = {};
  return { vars, el: { style: { setProperty: (k: string, v: string) => (vars[k] = v) } } };
};

const place = async (trigger: Rect, floating = { width: 360, height: 320 }, placement: 'bottom-end' | 'bottom-start' | 'top-start' = 'bottom-end') => {
  const f = fakeFloating();
  const result = await computePosition(trigger as never, f.el as never, {
    placement,
    strategy: 'fixed',
    middleware: popoverMiddleware(),
    platform: fakePlatform(floating),
  });
  return { ...result, vars: f.vars, box: { left: result.x, top: result.y, right: result.x + floating.width, bottom: result.y + floating.height } };
};

const button = (x: number, y: number): Rect => ({ x, y, width: 56, height: 56 });

const insideMargin = (box: { left: number; top: number; right: number; bottom: number }) => {
  expect(box.left).toBeGreaterThanOrEqual(POPOVER_MARGIN);
  expect(box.top).toBeGreaterThanOrEqual(POPOVER_MARGIN);
  expect(box.right).toBeLessThanOrEqual(VIEW.width - POPOVER_MARGIN);
  expect(box.bottom).toBeLessThanOrEqual(VIEW.height - POPOVER_MARGIN);
};

describe('popover placement', () => {
  it('opens below a trigger that has room, the gap away', async () => {
    const p = await place(button(600, 100));
    expect(p.placement).toBe('bottom-end');
    expect(p.box.top).toBe(100 + 56 + POPOVER_GAP);
    insideMargin(p.box);
  });

  it('flips above a trigger near the bottom edge (the open card’s ••• menu)', async () => {
    const p = await place(button(600, 700));
    expect(p.placement).toBe('top-end');
    expect(p.box.bottom).toBe(700 - POPOVER_GAP);
    insideMargin(p.box);
  });

  it('slides left from the right edge and right from the left edge', async () => {
    const right = await place(button(1250, 100), undefined, 'bottom-start');
    insideMargin(right.box);
    const left = await place(button(0, 100), undefined, 'bottom-end');
    insideMargin(left.box);
  });

  it('flips below a trigger at the top edge that prefers above (a composer’s picker)', async () => {
    const p = await place(button(400, 10), { width: 300, height: 200 }, 'top-start');
    expect(p.placement).toBe('bottom-start');
    insideMargin(p.box);
  });

  it('shrinks to the room on the roomier side when it fits on neither', async () => {
    const p = await place(button(600, 300), { width: 360, height: 900 });
    // 300px above vs 444px below: below wins, capped to what's left under the margin
    expect(p.placement).toBe('bottom-end');
    expect(p.vars['--mc-pop-max-h']).toBe(`${VIEW.height - POPOVER_MARGIN - (300 + 56 + POPOVER_GAP)}px`);
  });

  it('never shrinks below the minimum height', () => {
    expect(fitToRoom(400, 20)).toEqual({ maxWidth: 400, maxHeight: POPOVER_MIN_HEIGHT });
    expect(fitToRoom(-5, 500.7)).toEqual({ maxWidth: 0, maxHeight: 500 });
  });
});

describe('popoverHost', () => {
  const body = { tag: 'body' };
  it('portals to the body by default', () => {
    expect(popoverHost({ closest: () => null }, body)).toBe(body);
    expect(popoverHost(null, body)).toBe(body);
  });
  it('portals into the open sheet or popover the trigger sits in', () => {
    const dialog = { tag: 'dialog' };
    let asked = '';
    expect(
      popoverHost(
        {
          closest: (selector: string) => {
            asked = selector;
            return dialog;
          },
        },
        body,
      ),
    ).toBe(dialog);
    expect(asked).toBe('dialog[open], [data-mc-popover]');
  });
});
