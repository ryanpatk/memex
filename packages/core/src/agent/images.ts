/*
 * Images an agent can look at (get_images): link preview pictures and images
 * embedded in markdown (`![alt](url)`). URLs only, never bytes; only http(s),
 * so no data: URIs (which can be megabytes) reach a model's context.
 */
import { httpUrl } from '../capture/input';

export const IMAGE_LIMITS = {
  /** Items per page (get_images pages by item). */
  pageDefault: 20,
  pageMax: 50,
  /** Embedded images kept per item. */
  perItem: 5,
  altChars: 200,
} as const;

export interface AgentImage {
  url: string;
  alt: string | null;
  /** 'preview': a link's preview picture. 'embedded': an image in markdown text. */
  kind: 'preview' | 'embedded';
}

const MD_IMAGE = /!\[([^\]\n]{0,500})\]\(\s*<?([^\s)>]+)>?(?:\s+"[^"\n]*")?\s*\)/g;

/** http(s) images embedded in markdown, in order, deduped, at most `max`. */
export function markdownImages(text: string | null | undefined, max: number = IMAGE_LIMITS.perItem): AgentImage[] {
  if (!text) return [];
  const out: AgentImage[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(MD_IMAGE)) {
    const url = httpUrl(m[2]);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const alt = m[1].trim().slice(0, IMAGE_LIMITS.altChars);
    out.push({ url, alt: alt || null, kind: 'embedded' });
    if (out.length >= max) break;
  }
  return out;
}
