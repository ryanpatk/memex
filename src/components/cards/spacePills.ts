/** Past this many spaces the rest fold into a “More” pill. */
export const VISIBLE_SPACE_PILLS = 6;
/** Which spaces show as pills: the first six, plus the chosen one if it is further down. */
export const visibleSpacePills = <T extends { id: string }>(spaces: readonly T[], selectedId: string | null, limit = VISIBLE_SPACE_PILLS) => {
  if (spaces.length <= limit + 1) return { shown: [...spaces], more: [] as T[] };
  const shown = spaces.slice(0, limit);
  const chosen = selectedId ? spaces.find((space) => space.id === selectedId) : undefined;
  if (chosen && !shown.includes(chosen)) shown.push(chosen);
  return { shown, more: spaces.filter((space) => !shown.includes(space)) };
};
