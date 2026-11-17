/*
 * What the move sheet (components/cards/MoveSheet.tsx) shows, as plain
 * functions: which spaces already hold every card (ticked “All in”, pressing
 * takes them out) and which hold any (for “Take out of all”).
 */

type SpacesOf = (key: string) => readonly string[];

/** True when every key is filed in the space (and there is at least one key). */
export const spaceHoldsAll = (keys: readonly string[], spacesOf: SpacesOf, spaceId: string) =>
  keys.length > 0 && keys.every((key) => spacesOf(key).includes(spaceId));

/** Every space that holds at least one of the keys, each once. */
export const spacesHoldingAny = (keys: readonly string[], spacesOf: SpacesOf) =>
  Array.from(new Set(keys.flatMap((key) => spacesOf(key))));

/** What pressing a space's tile does. */
export const tileAction = (keys: readonly string[], spacesOf: SpacesOf, spaceId: string): 'add' | 'remove' | 'none' =>
  keys.length === 0 ? 'none' : spaceHoldsAll(keys, spacesOf, spaceId) ? 'remove' : 'add';
