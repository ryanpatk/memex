// X (Twitter): saving = the user's own Bookmark action. Likes are ignored.
import type { SaveWatcher } from '@/utils/intercept';
import type { CapturePayload } from '@/utils/types';

export const X_MATCHES = ['https://x.com/*', 'https://twitter.com/*'];

// The path segment before the operation is a query id X rotates; match the name only.
const CREATE_BOOKMARK = /\/graphql\/[^/]+\/CreateBookmark(?:$|[?/])/;

export const xWatcher: SaveWatcher = {
  site: 'x',
  match: (url, method) => method === 'POST' && CREATE_BOOKMARK.test(url),
  idFromBody(body) {
    try {
      const vars = JSON.parse(body)?.variables;
      const id = vars?.tweet_id ?? vars?.tweetId;
      return id ? String(id) : null;
    } catch {
      return body.match(/"tweet_?[Ii]d"\s*:\s*"?(\d+)"?/)?.[1] ?? null;
    }
  },
};

/** Outside a quoted tweet (X renders quotes as a nested role="link" card). */
const ownedBy = (article: Element) => (el: Element) =>
  el.closest('article') === article && !el.closest('article div[role="link"]');

/**
 * Read the bookmarked post from the page. X serves bots a login wall, so the
 * scraper gets nothing useful — this is the only place the text/author/media are visible.
 */
export function xPayload(id: string): CapturePayload {
  const time = document.querySelector(`a[href*="/status/${id}"] time`);
  const href = time?.closest('a')?.getAttribute('href') ?? '';
  const handle = href.match(/^\/([A-Za-z0-9_]{1,15})\/status\//)?.[1];
  const url = handle ? `https://x.com/${handle}/status/${id}` : `https://x.com/i/web/status/${id}`;
  const article = time?.closest('article');
  if (!article) return { url, source: 'x', sourceId: id, list: 'bookmarked' };

  const own = ownedBy(article);
  const first = (selector: string) => [...article.querySelectorAll(selector)].find(own) ?? null;

  const text = (first('[data-testid="tweetText"]') as HTMLElement | null)?.innerText.trim();
  const name = first('[data-testid="User-Name"] a')?.textContent?.trim();
  const photo = first('[data-testid="tweetPhoto"] img') as HTMLImageElement | null;
  const poster = (first('video[poster]') as HTMLVideoElement | null)?.poster;
  const cardImage = (first('[data-testid="card.wrapper"] img') as HTMLImageElement | null)?.src;
  const image = photo?.src.replace(/([?&]name=)\w+/, '$1large') || poster || cardImage || undefined;

  return {
    url,
    source: 'x',
    sourceId: id,
    list: 'bookmarked',
    title: name ? `${name}${handle ? ` (@${handle})` : ''} on X` : handle ? `@${handle} on X` : undefined,
    description: text || undefined,
    image,
  };
}
