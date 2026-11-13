import { memo, useCallback, useMemo, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { type LinkWithTag, getHostname, getLinkTitle, itemKey } from '@memex/core';
import { handleBackgroundLinkClick } from '../../utils/openUrlInBackgroundTab';
import { dragAttrs } from '../../utils/itemDrag';
import { guessImageRatio } from '../../utils/imageRatios';
import { useImageRatio } from '../../hooks/useImageRatio';
import { useShownRatio } from '../../hooks/useShownRatio';

interface LinkPreviewCardProps {
  link: LinkWithTag;
  /** Card body: expand details, or toggle selection in selection mode. */
  onActivate: (link: LinkWithTag) => void;
  /** Image failed to load — the stream swaps in the compact card. */
  onImageError: (linkId: string) => void;
  isSelected?: boolean;
  selectionMode?: boolean;
}

/**
 * A link with a preview image: the image is the card. Title and host sit on
 * a frosted caption over the bottom of the image — revealed on hover/focus or
 * always shown, per the html[data-link-captions] preference (utils/linkCaptions).
 *
 * The picture's box is sized before the picture arrives (its remembered
 * aspect ratio, or a guess by source until it reports its real size), the
 * box only changes size off-screen below the viewport, and the picture fades
 * in over it, so the grid never shifts as images load.
 */
const LinkPreviewCard = ({
  link,
  onActivate,
  onImageError,
  isSelected = false,
  selectionMode = false,
}: LinkPreviewCardProps) => {
  const [faviconFailed, setFaviconFailed] = useState(false);
  const host = useMemo(() => getHostname(link.url), [link.url]);
  const title = getLinkTitle(link);
  const key = itemKey('link', link.id);
  const imageUrl = link.preview_image_url ?? '';
  const { ratio, imageRef } = useImageRatio(imageUrl);
  // A size learned late is taken up only while the card is below the
  // viewport (the picture crops to its box until then), so nothing on
  // screen ever moves
  const [shownRatio, holdRef] = useShownRatio(imageUrl, ratio ?? guessImageRatio(link.url, link.source));

  // Already decoded (a remount while scrolling back): no fade, no flash
  const [loaded, setLoaded] = useState(false);
  const setImage = useCallback(
    (node: HTMLImageElement | null) => {
      imageRef(node);
      if (node?.complete && node.naturalWidth > 0) setLoaded(true);
    },
    [imageRef],
  );

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button, a')) return;
    onActivate(link);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate(link);
    }
  };

  const favicon =
    link.favicon_url && !faviconFailed ? (
      <img src={link.favicon_url} alt="" width={14} height={14} decoding="async" onError={() => setFaviconFailed(true)} />
    ) : (
      <span aria-hidden="true">{host.slice(0, 1).toUpperCase()}</span>
    );

  return (
    <article
      ref={holdRef}
      className={`memex-pv${isSelected ? ' is-selected' : ''}${selectionMode ? ' is-selection-mode' : ''}${
        link.id.startsWith('temp-') ? ' is-new' : ''
      }`}
      role="button"
      tabIndex={0}
      aria-label={selectionMode ? `Select ${title}` : `Details for ${title}`}
      aria-pressed={selectionMode ? isSelected : undefined}
      data-item-key={key}
      {...dragAttrs(key, title)}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {/* The grid mounts only cards near the viewport, so loading starts
          when it should; `loading="lazy"` would wait until the picture is
          inside the scroll area and resize it in view */}
      <img
        ref={setImage}
        className={`memex-pv-image${loaded ? ' is-loaded' : ''}`}
        src={imageUrl}
        alt=""
        decoding="async"
        style={{ aspectRatio: `1 / ${shownRatio}` } as CSSProperties}
        onLoad={() => setLoaded(true)}
        onError={() => onImageError(link.id)}
      />

      <span className="memex-pv-badge" aria-hidden="true">
        <span className="memex-pv-favicon">{favicon}</span>
        <span className="memex-pv-badge-host">{host}</span>
      </span>

      <div className="memex-pv-caption">
        <span className="memex-pv-host">
          <span className="memex-pv-favicon">{favicon}</span>
          <span>{host}</span>
        </span>
        <span className="memex-pv-title" title={title}>
          {title}
        </span>
      </div>

      {selectionMode ? (
        <span
          className={`memex-select-check memex-select-check--on-image${isSelected ? ' is-on' : ''}`}
          aria-hidden="true"
        >
          {isSelected && <Check />}
        </span>
      ) : (
        <div className="memex-pv-actions">
          <a
            className="memex-pv-action"
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleBackgroundLinkClick}
            aria-label={`Open ${title} in a new tab`}
            title="Open link"
          >
            <ExternalLink aria-hidden="true" />
          </a>
        </div>
      )}
    </article>
  );
};

export default memo(LinkPreviewCard);
