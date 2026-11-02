import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tryScrape } from './scraper';

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }));

afterEach(() => vi.restoreAllMocks());

describe('tryScrape', () => {
  it('goes through the service binding when there is one', async () => {
    const binding = { fetch: vi.fn<(input: string) => Promise<Response>>(async () => ok({ title: 'T', description: 'D', image: 'https://i/x.jpg', logo: 'https://i/f.ico' })) };
    const fetcher = vi.fn();
    const meta = await tryScrape({ binding, url: 'https://memex-scraper.example.workers.dev' }, 'https://example.com/a?b=1', fetcher as unknown as typeof fetch);
    expect(meta).toEqual({ title: 'T', description: 'D', image: 'https://i/x.jpg', favicon: 'https://i/f.ico' });
    expect(new URL(binding.fetch.mock.calls[0][0]).pathname).toBe('/api/scrape');
    expect(new URL(binding.fetch.mock.calls[0][0]).searchParams.get('url')).toBe('https://example.com/a?b=1');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('falls back to the URL without a binding (local dev)', async () => {
    const fetcher = vi.fn(async () => ok({ title: 'T' }));
    expect(await tryScrape({ url: 'https://scraper.example/' }, 'https://example.com', fetcher as unknown as typeof fetch)).toMatchObject({ title: 'T' });
    expect(String(fetcher.mock.calls[0])).toContain('https://scraper.example/api/scrape?url=');
  });

  it('treats Cloudflare’s 1042 (Worker → workers.dev fetch refused) as no metadata, and logs it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetcher = vi.fn(async () => new Response('error code: 1042\n', { status: 404 }));
    expect(await tryScrape({ url: 'https://scraper.example' }, 'https://example.com', fetcher as unknown as typeof fetch)).toEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('404'), 'non-JSON response');
  });

  it('survives a throwing binding and an unset scraper', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const binding = { fetch: async () => Promise.reject(new Error('no such service')) };
    expect(await tryScrape({ binding }, 'https://example.com')).toEqual({});
    expect(await tryScrape({}, 'https://example.com')).toEqual({});
  });
});

describe('wrangler.jsonc', () => {
  // The regression this guards: memex-api reached the scraper by its workers.dev
  // URL, which Cloudflare refuses Worker-to-Worker (1042), so every capture went
  // unscraped. Production must bind the scraper as a service.
  it('binds memex-scraper as the SCRAPER service', () => {
    const raw = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
    const config = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1')) as {
      services?: { binding: string; service: string }[];
    };
    expect(config.services).toContainEqual({ binding: 'SCRAPER', service: 'memex-scraper' });
  });
});
