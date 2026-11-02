/*
 * Links the system opens the app with, before Expo Router routes them. The
 * share extension (expo-share-intent) opens `memex://dataUrl=memexShareKey#…`
 * after handing the shared item over through the App Group; that becomes the
 * share sheet, which reads the item from the native module.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (path.includes('dataUrl=')) return '/share';
    return path;
  } catch {
    return '/';
  }
}
