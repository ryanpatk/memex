// “Already in memex” mark: a ✓ on the toolbar icon for tabs whose page is
// saved, from GET /api/lookup (read-only). Tab-specific, so it never touches
// the global badge (queue count, save flashes); while saves are waiting to
// sync, the count wins and no marks are shown. Off in settings = no lookups.
import { browser } from 'wxt/browser';
import { lookupUrl } from './api';
import { getQueueState } from './queue';
import { getSettings, isConfigured } from './settings';

const TTL = 10 * 60_000;
const MARK_COLOR = '#5077ff';
const cache = new Map<string, { saved: boolean; at: number }>();

const isHttp = (url?: string): url is string => Boolean(url && /^https?:\/\//.test(url));

/** Record what a save or lookup just told us about a URL. */
export function rememberSaved(url: string, saved: boolean): void {
  cache.set(url, { saved, at: Date.now() });
}

/** After an undo we don't know which URLs pointed at the link; start over. */
export function forgetMarks(): void {
  cache.clear();
}

async function setMark(tabId: number, saved: boolean): Promise<void> {
  // null text = fall back to the global badge for this tab.
  await browser.action
    .setBadgeText({ tabId, text: saved ? '✓' : (null as unknown as string) })
    .catch(() => {});
  if (saved) await browser.action.setBadgeBackgroundColor({ tabId, color: MARK_COLOR }).catch(() => {});
}

async function isSaved(url: string): Promise<boolean | null> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.saved;
  const settings = await getSettings();
  try {
    const saved = Boolean(await lookupUrl(settings, url));
    rememberSaved(url, saved);
    if (cache.size > 500) cache.delete(cache.keys().next().value as string);
    return saved;
  } catch {
    return null; // offline or token problem: show nothing rather than guess
  }
}

export async function refreshMark(tab: { id?: number; url?: string; incognito?: boolean }): Promise<void> {
  if (tab.id === undefined || tab.id < 0) return;
  const settings = await getSettings();
  const { queue } = await getQueueState();
  if (!settings.savedBadge || !isConfigured(settings) || tab.incognito || !isHttp(tab.url) || queue.length) {
    await setMark(tab.id, false);
    return;
  }
  const saved = await isSaved(tab.url);
  await setMark(tab.id, saved === true);
}

export async function refreshActiveMark(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
  if (tab) await refreshMark(tab);
}
