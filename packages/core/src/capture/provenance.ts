import type { CreateLinkData } from '../types';
import { normalizeUrlKey } from './urlKey';

/** `captured_client` for links saved in the web app. */
export const WEB_CLIENT = 'memex-web';

/**
 * Stamp a link saved in one of memex's own apps with its provenance:
 * `captured_by: 'app'`, the client's name and the normalized URL key (the
 * dedupe fallback), the same as the phone's saves through the capture
 * service. Anything the caller already set is kept.
 */
export const withAppProvenance = <T extends CreateLinkData>(data: T, client: string): T => ({
  ...data,
  captured_by: data.captured_by ?? 'app',
  captured_client: data.captured_client ?? client,
  url_key: data.url_key ?? normalizeUrlKey(data.url),
});
