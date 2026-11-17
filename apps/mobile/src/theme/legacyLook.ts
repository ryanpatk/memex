/*
 * Before Memory Cards became the phone's only look (2026-11-17), the account
 * sheet remembered a choice of look in AsyncStorage under this key. Nothing
 * reads it now; the app removes it once on startup. Plain TS, tested.
 */

export const LEGACY_LOOK_KEY = 'memex.look';

export interface LegacyStorage {
  removeItem: (key: string) => Promise<void>;
}

/** Best effort: a failure (sync or async) is ignored, and the value is harmless if it stays. */
export const forgetLegacyLook = (storage: LegacyStorage | undefined): void => {
  if (!storage) return;
  try {
    storage.removeItem(LEGACY_LOOK_KEY).catch(() => {});
  } catch {
    // storage unavailable: nothing to clean up
  }
};
