import type { PageMetadata } from '@memex/core/capture';

/*
 * Link metadata at capture time from the memex-scraper Worker (scraper/), the
 * same one the web uses (VITE_SCRAPER_URL there). Optional: without
 * EXPO_PUBLIC_SCRAPER_URL a link saves with what its URL says. The Worker's
 * origin allowlist is a browser (CORS) rule, so native fetches pass.
 */

const SCRAPER_URL = (process.env.EXPO_PUBLIC_SCRAPER_URL ?? '').replace(/\/$/, '');

export const scraperEnabled = Boolean(SCRAPER_URL);

/** Best effort: never throws, empty on failure or after 9 s. */
export const scrapeLink = async (url: string, fetcher: typeof fetch = fetch, base = SCRAPER_URL): Promise<PageMetadata> => {
  if (!base) return {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetcher(`${base}/api/scrape?url=${encodeURIComponent(url)}`, { signal: controller.signal });
    const result = (await response.json()) as { success?: boolean; data?: { title?: string; description?: string; image?: string; logo?: string | null } };
    if (!result.success || !result.data) return {};
    const { title, description, image, logo } = result.data;
    return { title, description, image, favicon: logo ?? undefined };
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
};
