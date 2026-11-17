import { hostOf, sourceOf, type LinkWithTag } from '@memex/core';

/** What the right side of a link's label says: the platform for pins and posts, else the host. */
export const linkLabelMeta = (link: Pick<LinkWithTag, 'url' | 'source'>) => {
  const source = sourceOf(link);
  if (source.key === 'pinterest') return 'pinterest';
  if (source.key === 'x') return 'X';
  return hostOf(link.url);
};
