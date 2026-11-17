/**
 * Browser settings that only the classic look used (retired 2026-11-17; the
 * last classic build is the tag `classic-design-final`). A browser that still
 * holds them is cleaned once on load, so nothing reads them again. Nothing
 * else depends on them: `?look=` and these keys are simply ignored.
 */
export const RETIRED_STORAGE_KEYS = [
  'memex.look', // the look switch (?look=, Settings → Look)
  'memex.link-captions', // Settings → Link cards (hover / overlay / inset)
  'memex.self-notes-open', // the docked Journal panel in the Library
  'memex.library.hadPinned', // the Library's pinned-sites row
] as const;

/** Removes the retired keys; storage that can't be reached is left alone. */
export const forgetRetiredSettings = (storage: Pick<Storage, 'removeItem'> | null = safeLocalStorage()) => {
  if (!storage) return;
  for (const key of RETIRED_STORAGE_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      /* storage unavailable: nothing to clean */
    }
  }
};

const safeLocalStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};
