// Pinterest: saving a pin to any board (Save button or board picker).
import type { SaveWatcher } from '@/utils/intercept';
import type { CapturePayload } from '@/utils/types';

export const PINTEREST_MATCHES = ['https://*.pinterest.com/*'];

const SAVE_RE = /\/resource\/(?:Repin|RepinSave|BoardPickerSave|UserPin|Pin)Resource\/create\/?(?:\?|$)/i;

/** Pinterest posts form-encoded `data=<urlencoded JSON>` (sometimes plain JSON). */
function parseData(body: string): Record<string, unknown> | null {
  const raw = body.startsWith('{') ? body : new URLSearchParams(body).get('data');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const pinterestWatcher: SaveWatcher = {
  site: 'pinterest',
  match: (url, method) => method === 'POST' && SAVE_RE.test(url),
  idFromBody(body) {
    const json = parseData(body);
    const opts = (json?.options ?? json ?? {}) as Record<string, unknown>;
    const id = opts.pin_id ?? opts.source_pin_id ?? opts.id;
    return id && /^\d+$/.test(String(id)) ? String(id) : null;
  },
};

/** Pinterest serves several sizes from one path; 736x always exists. */
const largest = (src: string) => src.replace(/\/(?:\d+x\d*|originals)\//, '/736x/');

export function pinterestPayload(id: string): CapturePayload {
  const url = `https://www.pinterest.com/pin/${id}/`;
  const card = document.querySelector(`[data-test-pin-id="${id}"]`);
  let img = card?.querySelector('img') ?? null;
  // On the pin's own page the grid card isn't there; the closeup is.
  if (!img && location.pathname.startsWith(`/pin/${id}`)) {
    img = document.querySelector('[data-test-id="pin-closeup-image"] img, [data-test-id="closeup-image"] img');
  }
  const src = img?.currentSrc || img?.src;
  return {
    url,
    source: 'pinterest',
    sourceId: id,
    list: 'saved',
    // Title and description come from the scraper, which reads the pin's
    // own metadata; grid alt text is too generic to win over it.
    image: src ? largest(src) : undefined,
  };
}
