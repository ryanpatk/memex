import { describe, expect, it } from 'vitest';
import { estimatedLines, pictureHeight, textCardHeight } from './cardEstimates';

describe('card estimates', () => {
  // Heights measured in the Library at a 250px column (2026-11-12)
  it('matches measured text cards', () => {
    expect(textCardHeight(250, 20)).toBe(76); // one-line link
    expect(textCardHeight(250, 54)).toBe(96); // two-line link
    expect(textCardHeight(250, 98)).toBe(116); // three-line link
    expect(textCardHeight(250, 21, 165)).toBe(204); // note: 1 title line, 6 excerpt lines
    expect(textCardHeight(250, 37, 87)).toBe(164); // note: 2 + 3
  });

  it('clamps titles to 3 lines and excerpts to 7', () => {
    expect(estimatedLines(1000, 250, 3)).toBe(3);
    expect(textCardHeight(250, 1000, 5000)).toBe(56 + 60 + 8 + 140);
  });

  it('clamps pictures like the card does', () => {
    expect(pictureHeight(250, 0.5625)).toBeCloseTo(140.6, 1);
    expect(pictureHeight(250, 0.1)).toBe(72);
    expect(pictureHeight(250, 4)).toBe(520);
  });
});
