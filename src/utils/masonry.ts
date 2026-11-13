/*
 * The Library grid's geometry as plain functions (no DOM, no React), so the
 * virtualized masonry (components/stream/MasonryLayout) stays cheap and
 * testable: lay out every item from known or estimated heights, then render
 * only the ones near the viewport.
 */

export interface MasonryEntry {
  key: string;
  /** 2 = spans two columns (an expanded card). Falls back to 1 on a single column. */
  span?: 1 | 2;
}

export interface MasonryBox {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  span: 1 | 2;
}

export interface MasonryGeometry {
  columns: number;
  columnWidth: number;
  columnGap: number;
  rowGap: number;
}

export interface MasonryResult {
  boxes: MasonryBox[];
  /** Total content height (no trailing gap). */
  height: number;
}

/** Columns are added while each can stay at least `minColumnWidth` wide. */
export const masonryGeometry = (
  width: number,
  minColumnWidth: number,
  columnGap: number,
  rowGap: number,
): MasonryGeometry => {
  const columns = Math.max(1, Math.floor((width + columnGap) / (minColumnWidth + columnGap)));
  const columnWidth = width > 0 ? (width - columnGap * (columns - 1)) / columns : 0;
  return { columns, columnWidth, columnGap, rowGap };
};

/** The rendered width of an item spanning `span` columns. */
export const spanWidth = (geometry: MasonryGeometry, span: 1 | 2 | undefined) =>
  span === 2 && geometry.columns > 1 ? geometry.columnWidth * 2 + geometry.columnGap : geometry.columnWidth;

/**
 * Shortest-column masonry, in item order. An item only ever lands at or below
 * every earlier item's top, so a height change moves nothing above it — which
 * is what lets cards settle off-screen without visible jumps.
 */
export const layoutMasonry = (
  items: readonly MasonryEntry[],
  geometry: MasonryGeometry,
  heightOf: (key: string, width: number, index: number) => number,
): MasonryResult => {
  const { columns, columnWidth, columnGap, rowGap } = geometry;
  const heights = new Array<number>(columns).fill(0);
  const boxes: MasonryBox[] = new Array(items.length);

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const span: 1 | 2 = item.span === 2 && columns > 1 ? 2 : 1;
    const width = spanWidth(geometry, span);
    const height = Math.max(0, heightOf(item.key, width, index));
    let column = 0;
    let top: number;
    if (span === 2) {
      let best = Infinity;
      for (let c = 0; c < columns - 1; c += 1) {
        const candidate = Math.max(heights[c], heights[c + 1]);
        if (candidate < best) {
          best = candidate;
          column = c;
        }
      }
      top = best;
      heights[column] = top + height + rowGap;
      heights[column + 1] = top + height + rowGap;
    } else {
      let best = Infinity;
      for (let c = 0; c < columns; c += 1) {
        if (heights[c] < best) {
          best = heights[c];
          column = c;
        }
      }
      top = best;
      heights[column] = top + height + rowGap;
    }
    boxes[index] = { key: item.key, x: column * (columnWidth + columnGap), y: top, width, height, span };
  }

  const tallest = items.length ? Math.max(...heights) - rowGap : 0;
  return { boxes, height: Math.max(0, tallest) };
};

/**
 * Indices of the boxes that overlap [top, bottom], in item order (the DOM and
 * keyboard order). A linear pass: a few thousand comparisons per scroll frame
 * costs microseconds, and masonry tops aren't sorted closely enough to bisect.
 */
export const boxesInRange = (boxes: readonly MasonryBox[], top: number, bottom: number): number[] => {
  const out: number[] = [];
  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index];
    if (box.y <= bottom && box.y + box.height >= top) out.push(index);
  }
  return out;
};

/** The first box (in item order) whose top edge is inside [top, bottom]: the scroll anchor. */
export const anchorIn = (boxes: readonly MasonryBox[], indices: readonly number[], top: number, bottom: number) => {
  let anchor: MasonryBox | null = null;
  for (const index of indices) {
    const box = boxes[index];
    if (box.y >= top && box.y <= bottom && (!anchor || box.y < anchor.y)) anchor = box;
  }
  return anchor;
};
