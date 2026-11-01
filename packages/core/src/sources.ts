import { getHostname } from './links';
import type { LinkWithTag } from './types';

/*
 * The source registry (CONTEXT.md: Source): which platform a saved link came
 * from. The Journal folds back-to-back saves from one platform into a run and
 * shows platform saves as pictures; the filing suggester ignores aggregator
 * hosts. Captures from memex-api tag `links.source` (`extension`,
 * `x:bookmark`, `pinterest:save`); links saved in the app have no tag, so the
 * host decides.
 */

export type SourceKey = 'x' | 'pinterest' | 'youtube' | 'web';
export type Source = { key: SourceKey; label: string; one: string; many: string };

/** The platforms memex knows by name; anything else is `web`, labelled by its host. */
export const SOURCES: Readonly<Record<Exclude<SourceKey, 'web'>, Source>> = {
  x: { key: 'x', label: 'X', one: 'post', many: 'posts' },
  pinterest: { key: 'pinterest', label: 'Pinterest', one: 'pin', many: 'pins' },
  youtube: { key: 'youtube', label: 'YouTube', one: 'video', many: 'videos' },
};

/** A URL's host without `www.`. */
export const hostOf = (url: string) => getHostname(url).replace(/^www\./, '');

/** Which platform a link came from: the capture tag when present, else its host. */
export const sourceOf = (link: Pick<LinkWithTag, 'url' | 'source'>): Source => {
  const host = hostOf(link.url);
  const tag = link.source ?? '';
  if (tag.startsWith('pinterest') || /(^|\.)pinterest\.|^pin\.it$/.test(host)) return SOURCES.pinterest;
  if (tag.startsWith('x:') || /^(x|twitter)\.com$/.test(host)) return SOURCES.x;
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) return SOURCES.youtube;
  return { key: 'web', label: host, one: 'link', many: 'links' };
};
