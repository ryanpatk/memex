import { describe, expect, it } from 'vitest';
import { anchorIn, boxesInRange, layoutMasonry, masonryGeometry, spanWidth } from './masonry';

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `k${i}` }));
// Deterministic mixed heights, like a real grid of pictures and text cards
const heightOf = (_key: string, _width: number, index: number) => 80 + ((index * 97) % 340);

describe('masonryGeometry', () => {
  it('adds columns while each can stay at least the minimum width', () => {
    expect(masonryGeometry(1000, 232, 12, 12).columns).toBe(4);
    expect(masonryGeometry(480, 232, 12, 12).columns).toBe(2);
    expect(masonryGeometry(200, 232, 12, 12).columns).toBe(1);
  });

  it('splits the width into equal columns around the gaps', () => {
    const g = masonryGeometry(1000, 232, 12, 12);
    expect(g.columnWidth * g.columns + g.columnGap * (g.columns - 1)).toBeCloseTo(1000);
  });

  it('gives a wide item two columns and a gap, but one column on a single column', () => {
    const g = masonryGeometry(1000, 232, 12, 12);
    expect(spanWidth(g, 2)).toBeCloseTo(g.columnWidth * 2 + 12);
    expect(spanWidth(masonryGeometry(200, 232, 12, 12), 2)).toBe(200);
  });
});

describe('layoutMasonry', () => {
  const g = masonryGeometry(1000, 232, 12, 12);

  it('places each item in the shortest column, in order', () => {
    const { boxes } = layoutMasonry(items(5), g, (_k, _w, i) => [100, 300, 200, 50, 10][i]);
    expect(boxes.slice(0, 4).map((b) => b.y)).toEqual([0, 0, 0, 0]);
    // the 5th goes under the 50px card (column 3): 50 + 12 gap
    expect(boxes[4]).toMatchObject({ x: boxes[3].x, y: 62 });
  });

  it('never overlaps two cards', () => {
    const { boxes } = layoutMasonry(items(300), g, heightOf);
    for (const a of boxes) {
      for (const b of boxes) {
        if (a === b) continue;
        const overlapX = a.x < b.x + b.width && b.x < a.x + a.width;
        const overlapY = a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });

  it('places a later item no higher than any earlier item, so growing a card moves nothing above it', () => {
    const { boxes } = layoutMasonry(items(500), g, heightOf);
    for (let i = 1; i < boxes.length; i += 1) {
      const highestBefore = Math.min(...boxes.slice(0, i).map((b) => b.y));
      expect(boxes[i].y).toBeGreaterThanOrEqual(highestBefore);
    }
    // Grow card 200: every card placed before it keeps its position
    const grown = layoutMasonry(items(500), g, (k, w, i) => (i === 200 ? heightOf(k, w, i) + 150 : heightOf(k, w, i)));
    expect(grown.boxes.slice(0, 201).map((b) => [b.x, b.y])).toEqual(boxes.slice(0, 201).map((b) => [b.x, b.y]));
  });

  it('lays a wide item over two columns', () => {
    const { boxes } = layoutMasonry([{ key: 'a' }, { key: 'wide', span: 2 }, { key: 'b' }], g, () => 100);
    expect(boxes[1].span).toBe(2);
    expect(boxes[1].width).toBeCloseTo(spanWidth(g, 2));
  });

  it('reports the content height without a trailing gap', () => {
    const { height } = layoutMasonry(items(4), g, () => 100);
    expect(height).toBe(100);
    expect(layoutMasonry([], g, () => 100).height).toBe(0);
  });
});

describe('virtualization window', () => {
  it('renders a bounded number of cards however big the Library is', () => {
    const g = masonryGeometry(1072, 232, 12, 12);
    for (const n of [2000, 5000, 20000]) {
      const { boxes, height } = layoutMasonry(items(n), g, heightOf);
      // a 800px screen with the grid's overscan (1 screen behind, 1.5 ahead), mid-list
      const top = height / 2;
      const rendered = boxesInRange(boxes, top - 800, top + 800 * 2.5);
      expect(rendered.length).toBeGreaterThan(10);
      expect(rendered.length).toBeLessThan(70);
    }
  });

  it('returns window indices in item order (the DOM and Tab order)', () => {
    const { boxes } = layoutMasonry(items(400), masonryGeometry(1000, 232, 12, 12), heightOf);
    const rendered = boxesInRange(boxes, 3000, 4500);
    expect(rendered).toEqual([...rendered].sort((a, b) => a - b));
    for (const index of rendered) {
      expect(boxes[index].y <= 4500 && boxes[index].y + boxes[index].height >= 3000).toBe(true);
    }
  });

  it('anchors on the highest card whose top is on screen', () => {
    const { boxes } = layoutMasonry(items(400), masonryGeometry(1000, 232, 12, 12), heightOf);
    const onScreen = boxesInRange(boxes, 3000, 3800);
    const anchor = anchorIn(boxes, onScreen, 3000, 3800);
    expect(anchor).not.toBeNull();
    for (const index of onScreen) {
      if (boxes[index].y >= 3000) expect(boxes[index].y).toBeGreaterThanOrEqual(anchor!.y);
    }
  });
});
