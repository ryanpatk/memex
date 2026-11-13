/*
 * Stream card heights from their text, for cards the virtualized grid hasn't
 * measured yet. Mirrors the text card's anatomy in components.css (“Stream
 * cards”): 12px padding, a 24px header, 8px gaps, 20px lines, titles clamped
 * to 3 lines and grid excerpts to 7. Close enough that a card measuring in
 * barely moves anything; exactness comes from measuring.
 */

const PADDING_X = 24;
const BASE = 12 + 24 + 8 + 12; // padding top + header + gap + padding bottom
const LINE = 20;
const GAP = 8;
/** Average advance of Inter at 14px, padded for word-wrap slack. */
const CHAR_PX = 7.3;

export const estimatedLines = (length: number, cardWidth: number, max: number) =>
  Math.min(max, Math.max(1, Math.ceil((length * CHAR_PX) / Math.max(40, cardWidth - PADDING_X))));

/** A text card (image-less link or note): title lines, then optional excerpt lines. */
export const textCardHeight = (cardWidth: number, titleLength: number, excerptLength = 0) =>
  BASE +
  LINE * estimatedLines(titleLength, cardWidth, 3) +
  (excerptLength > 0 ? GAP + LINE * estimatedLines(excerptLength, cardWidth, 7) : 0);

/** An image-first link card's picture box, clamped like `.memex-pv-image`. */
export const pictureHeight = (cardWidth: number, ratio: number) => Math.min(520, Math.max(72, cardWidth * ratio));
