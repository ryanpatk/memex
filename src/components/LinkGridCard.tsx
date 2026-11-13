import { memo, useMemo, useState } from 'react';
import { LinkWithTag, getTagsForLink, getHostname, getLinkTitle, itemKey } from '@memex/core';
import StreamCard from './StreamCard';
import { getInitials } from '../utils/streamCardFormat';
import { handleBackgroundLinkClick } from '../utils/openUrlInBackgroundTab';
import { ExternalLink } from 'lucide-react';

interface LinkGridCardProps {
  link: LinkWithTag;
  /** Card body: expand details, or toggle selection in selection mode. */
  onActivate: (link: LinkWithTag) => void;
  isDetailsActive?: boolean;
  isSelected?: boolean;
  selectionMode?: boolean;
  hideActions?: boolean;
}

/** Link without a preview image as a stream card: favicon + host, title, tag footer. */
const LinkGridCard = ({
  link,
  onActivate,
  isDetailsActive = false,
  isSelected = false,
  selectionMode = false,
  hideActions = false,
}: LinkGridCardProps) => {
  const [imageFailed, setImageFailed] = useState(false);

  const tags = useMemo(() => getTagsForLink(link), [link]);
  const faviconUrl = link.favicon_url;
  const host = useMemo(() => getHostname(link.url), [link.url]);
  const title = getLinkTitle(link);

  return (
    <StreamCard
      type="link"
      itemKey={itemKey('link', link.id)}
      isNew={link.id.startsWith('temp-')}
      leading={
        faviconUrl && !imageFailed ? (
          <img src={faviconUrl} alt="" width={16} height={16} decoding="async" onError={() => setImageFailed(true)} />
        ) : (
          <span className="memex-card-favicon-initials">{getInitials(host)}</span>
        )
      }
      meta={host}
      metaTitle={host}
      title={title}
      tags={tags}
      onActivate={() => onActivate(link)}
      isSelected={isSelected}
      selectionMode={selectionMode}
      isDetailsActive={isDetailsActive}
      actions={
        !hideActions ? (
          <a
            className="memex-icon-button"
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleBackgroundLinkClick}
            aria-label={`Open ${title} in a new tab`}
            title="Open link"
          >
            <ExternalLink aria-hidden="true" />
          </a>
        ) : undefined
      }
    />
  );
};

export default memo(LinkGridCard);
