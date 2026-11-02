import type { PageMetadata } from '../../packages/core/src/capture';

interface ScrapedData {
  title?: string;
  description?: string;
  image?: string;
  logo?: string;
}

/** How to reach memex-scraper. */
export interface ScraperTarget {
  /**
   * Service binding (wrangler.jsonc → services → SCRAPER). Required in
   * production: Cloudflare refuses a Worker's fetch to another Worker's
   * workers.dev URL on the same account (error 1042), so the URL alone only
   * works outside Cloudflare (e.g. `wrangler dev` without the binding).
   */
  binding?: { fetch(input: string): Promise<Response> };
  url?: string;
}

/** Page metadata from memex-scraper; {} when it's unset, slow (9s) or fails (logged). */
export async function tryScrape(target: ScraperTarget, url: string, fetcher: typeof fetch = fetch): Promise<PageMetadata> {
  const path = `/api/scrape?url=${encodeURIComponent(url)}`;
  let res: Response;
  try {
    if (target.binding) {
      // The host is ignored by a service binding; only the path matters.
      res = await Promise.race([
        target.binding.fetch(`https://memex-scraper${path}`),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 9000)),
      ]);
    } else if (target.url) {
      res = await fetcher(`${target.url.replace(/\/$/, '')}${path}`, { signal: AbortSignal.timeout(9000) });
    } else {
      return {};
    }
  } catch (err) {
    console.warn('memex-api: scraper unreachable', err instanceof Error ? err.message : err);
    return {};
  }
  const body = (await res.json().catch(() => null)) as { success?: boolean; data?: ScrapedData; error?: string } | null;
  if (!res.ok || !body?.success || !body.data) {
    // Expected for sites that block bots; a 1042 here means the binding is missing.
    console.warn(`memex-api: scrape failed (${res.status})`, body?.error ?? 'non-JSON response');
    return {};
  }
  const { title, description, image, logo } = body.data;
  return { title, description, image, favicon: logo };
}
