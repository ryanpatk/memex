import { useMemo, useState } from 'react';
import { LinkWithTag, getTagsForLink, getHostname, getLinkTitle, itemKey } from '@memex/core';
import StreamCard from './StreamCard';
import { getInitials } from '../utils/streamCardFormat';
import { handleBackgroundLinkClick } from '../utils/openUrlInBackgroundTab';
import { ExternalLink } from 'lucide-react';

interface LinkGridCardProps {
  link: LinkWithTag;
  /** Card body: expand details, or toggle selection in selection mode. */
  onActivate: () => void;
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
  const host = getHostname(link.url);
  const title = getLinkTitle(link);

  return (
    <StreamCard
      type="link"
      itemKey={itemKey('link', link.id)}
      isNew={link.id.startsWith('temp-')}
      leading={
        faviconUrl && !imageFailed ? (
          <img src={faviconUrl} alt="" onError={() => setImageFailed(true)} />
        ) : (
          <span className="memex-card-favicon-initials">{getInitials(host)}</span>
        )
      }
      meta={host}
      metaTitle={host}
      title={title}
      tags={tags}
      onActivate={onActivate}
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

export default LinkGridCard;
