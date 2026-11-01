import { browser } from 'wxt/browser';
import type { WatchedSite } from './types';

export interface Settings {
  /** memex-api worker origin, no trailing slash. */
  apiUrl: string;
  /** Personal access token (mx_…), from memex Settings → Access tokens. */
  token: string;
  /** memex web app origin, for “Open in memex”. */
  appUrl: string;
  sound: boolean;
  /** Save to memex when you bookmark on X / save on Pinterest. */
  sites: Record<WatchedSite, boolean>;
}

export const DEFAULT_SETTINGS: Settings = {
  apiUrl: 'https://memex-api.joyfulsystems.workers.dev',
  token: '',
  appUrl: 'https://memex.joyfulsystems.workers.dev',
  sound: true,
  sites: { x: true, pinterest: true },
};

const trimUrl = (value: string) => value.trim().replace(/\/+$/, '');

// Device-local on purpose: storage.sync would copy the token to every browser
// signed into the same Google account.
export async function getSettings(): Promise<Settings> {
  const stored = (await browser.storage.local.get('settings')).settings as
    | Partial<Settings>
    | undefined;
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    sites: { ...DEFAULT_SETTINGS.sites, ...stored?.sites },
  };
}

export async function saveSettings(next: Settings): Promise<void> {
  await browser.storage.local.set({
    settings: {
      ...next,
      apiUrl: trimUrl(next.apiUrl),
      appUrl: trimUrl(next.appUrl) || DEFAULT_SETTINGS.appUrl,
      token: next.token.trim(),
    },
  });
}

/** v0.1 kept apiUrl/token/sound in storage.sync; move them here once. */
export async function migrateLegacySettings(): Promise<void> {
  const legacy = await browser.storage.sync.get(['apiUrl', 'token', 'sound']);
  if (!legacy.apiUrl && !legacy.token) return;
  const current = await getSettings();
  if (!current.token) {
    await saveSettings({
      ...current,
      apiUrl: String(legacy.apiUrl ?? ''),
      token: String(legacy.token ?? ''),
      sound: legacy.sound !== false,
    });
  }
  await browser.storage.sync.remove(['apiUrl', 'token', 'sound']);
}

export const isConfigured = (s: Settings) => Boolean(s.apiUrl && s.token);

export const linkInAppUrl = (s: Settings, linkId: string) =>
  `${s.appUrl}/home?link=${encodeURIComponent(linkId)}`;

/** Flip one auto-save site without touching anything else (popup, toolbar menu). */
export async function setSiteEnabled(site: WatchedSite, enabled: boolean): Promise<void> {
  const current = await getSettings();
  await saveSettings({ ...current, sites: { ...current.sites, [site]: enabled } });
}

export const SITE_LABEL: Record<WatchedSite, string> = {
  x: 'X bookmarks',
  pinterest: 'Pinterest saves',
};
