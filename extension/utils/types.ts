/** Platform a capture came from (CONTEXT.md → Source); stored as `links.source`. */
export type CaptureSource = 'x' | 'pinterest' | 'youtube' | 'web';
/** Which of your lists on the source held it. */
export type CaptureList = 'bookmarked' | 'saved' | 'liked';

/**
 * What the extension sends memex-api. Client metadata wins over scraped
 * values. The server re-derives source and sourceId from the URL and rejects
 * a mismatch. Queued payloads from v0.2 carry a legacy `source` tag
 * ('extension', 'x:bookmark', 'pinterest:save'); the API still accepts those.
 */
export interface CapturePayload {
  url: string;
  /** Omitted for toolbar / context-menu saves: the server works it out from the URL. */
  source?: CaptureSource | string;
  /** Post / pin / video id. */
  sourceId?: string;
  list?: CaptureList;
  capturedBy?: 'extension';
  /** e.g. 'memex-extension/0.3.0'; filled in by the background worker. */
  client?: string;
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
}

export interface SavedLink {
  id: string;
  url: string;
  title: string | null;
}

export type CaptureResult =
  | { status: 'saved'; link: SavedLink }
  | { status: 'duplicate'; link: SavedLink }
  | { status: 'queued'; message: string }
  | { status: 'setup' }
  | { status: 'error'; message: string };

export interface Space {
  id: string;
  name: string;
}

export type ExtensionMessage =
  | { type: 'capture'; payload: CapturePayload }
  | { type: 'undo'; linkId: string }
  | { type: 'flush' }
  | { type: 'spaces' }
  | { type: 'file'; linkId: string; spaceId: string };

/** Sites whose own save buttons we watch. */
export type WatchedSite = 'x' | 'pinterest' | 'youtube';

/** What an id posted by a MAIN-world watcher must look like, per site. */
export const SITE_ID_PATTERN: Record<WatchedSite, RegExp> = {
  x: /^\d{1,25}$/,
  pinterest: /^\d{1,25}$/,
  youtube: /^[A-Za-z0-9_-]{11}$/,
};

/** MAIN-world → isolated-world envelope (window.postMessage). */
export const SAVE_EVENT = 'memex:site-save';
export interface SiteSaveEvent {
  type: typeof SAVE_EVENT;
  site: WatchedSite;
  id: string;
}
