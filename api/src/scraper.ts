import type { PageMetadata } from '../../packages/core/src/capture';

interface ScrapedData {
  title?: string;
  description?: string;
  image?: string;
  logo?: string;
}

/** Page metadata from memex-scraper; {} when it's unset, slow (9s) or fails. */
export async function tryScrape(scraperUrl: string | undefined, url: string, fetcher: typeof fetch = fetch): Promise<PageMetadata> {
  if (!scraperUrl) return {};
  try {
    const res = await fetcher(`${scraperUrl.replace(/\/$/, '')}/api/scrape?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(9000),
    });
    const body = (await res.json()) as { success: boolean; data?: ScrapedData };
    if (!body.success || !body.data) return {};
    const { title, description, image, logo } = body.data;
    return { title, description, image, favicon: logo };
  } catch {
    return {};
  }
}
