/*
 * Memory card heights from their text, for cards the virtualized grid hasn't
 * measured yet (Memory Cards look). Mirrors the card anatomy in
 * styles/cards/kit.css (“Memory card”): a 12px inset, a 26px/1.2 title, the
 * 44px label strip; notes at 28px/1.25, jots at 30px/1.2 with 24px padding.
 * Close enough that a card measuring in barely moves anything; measuring
 * makes it exact (same contract as utils/cardEstimates.ts).
 */

const LABEL = 44;
const TITLE_LINE = 31.2; // 26px × 1.2
const NOTE_LINE = 35; // 28px × 1.25
const JOT_LINE = 36; // 30px × 1.2
const EXCERPT_LINE = 23.2; // 16px × 1.45
/** Average advance of Nunito 800 at 26px, padded for word-wrap slack. */
const TITLE_CHAR = 13.6;
const NOTE_CHAR = 14.6;
const JOT_CHAR = 16;
const EXCERPT_CHAR = 8.2;

export const linesFor = (length: number, textWidth: number, charPx: number, max: number) =>
  Math.min(max, Math.max(1, Math.ceil((length * charPx) / Math.max(60, textWidth))));

/** The tallest a card's picture box gets (height ÷ width): tall pins crop, so one can't fill a column. */
export const MC_MAX_PICTURE_RATIO = 1.25;

/** A picture's box inside the card, clamped like LinkMemoryCard (0.45–1.25). */
export const memoryPictureHeight = (cardWidth: number, ratio: number) =>
  (cardWidth - 24) * Math.min(MC_MAX_PICTURE_RATIO, Math.max(0.45, ratio));

export const pictureCardHeight = (cardWidth: number, ratio: number, titleLength: number) =>
  12 + memoryPictureHeight(cardWidth, ratio) + 16 + TITLE_LINE * linesFor(titleLength, cardWidth - 48, TITLE_CHAR, 4) + 24 + LABEL;

/** A link without a picture: the favicon block, then the title. */
export const linkCardHeight = (cardWidth: number, titleLength: number) =>
  12 + 12 + 56 + 12 + TITLE_LINE * linesFor(titleLength, cardWidth - 48, TITLE_CHAR, 4) + 24 + LABEL;

export const noteCardHeight = (cardWidth: number, titleLength: number, excerptLength: number) =>
  12 +
  16 +
  NOTE_LINE * linesFor(titleLength, cardWidth - 48, NOTE_CHAR, 6) +
  (excerptLength > 0 ? 8 + EXCERPT_LINE * linesFor(excerptLength, cardWidth - 48, EXCERPT_CHAR, 4) : 0) +
  24 +
  LABEL;

export const jotCardHeight = (cardWidth: number, length: number) =>
  24 + JOT_LINE * linesFor(length, cardWidth - 48, JOT_CHAR, 6) + 24 + LABEL;

export const taskCardHeight = (cardWidth: number, titleLength: number, hasDue: boolean) =>
  24 + Math.max(48, TITLE_LINE * linesFor(titleLength, cardWidth - 48 - 64, TITLE_CHAR, 4) + (hasDue ? 48 : 0)) + 24 + LABEL;
