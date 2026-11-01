// Isolated-world half of site watching: receives ids from the MAIN-world
// interceptor, reads the item off the page, and hands it to the background.
import { browser } from 'wxt/browser';
import { getSettings } from './settings';
import { showCaptureToast } from './toast';
import {
  SAVE_EVENT,
  SITE_ID_PATTERN,
  type CapturePayload,
  type CaptureResult,
  type ExtensionMessage,
  type SiteSaveEvent,
  type WatchedSite,
} from './types';

export function bridgeSaves(site: WatchedSite, toPayload: (id: string) => CapturePayload): void {
  const seen = new Set<string>();
  window.addEventListener('message', async (event: MessageEvent<SiteSaveEvent>) => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    // The page could forge this message, so accept nothing but a well-formed
    // id for this site and build the URL ourselves.
    if (data?.type !== SAVE_EVENT || data.site !== site || !SITE_ID_PATTERN[site].test(String(data.id))) return;
    if (seen.has(data.id)) return;

    const settings = await getSettings();
    if (!settings.sites[site]) return;
    seen.add(data.id);

    const message: ExtensionMessage = { type: 'capture', payload: toPayload(data.id) };
    try {
      const result = (await browser.runtime.sendMessage(message)) as CaptureResult;
      showCaptureToast(result, settings.sound);
      if (result.status === 'error') seen.delete(data.id);
    } catch {
      // Extension reloaded under the page; the page needs a refresh to reconnect.
      seen.delete(data.id);
    }
  });
}
