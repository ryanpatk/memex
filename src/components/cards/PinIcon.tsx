import { useState } from 'react';
import { pinLabel, type LinkWithTag } from '@memex/core';

/** A pinned site's icon: its favicon, or its first letter on a soft tile when there's none (or it fails). */
const PinIcon = ({ link, size = 28 }: { link: LinkWithTag; size?: number }) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const src = link.favicon_url && link.favicon_url !== failedUrl ? link.favicon_url : null;
  if (src) {
    return (
      <img
        className="mc-pin-fav"
        src={src}
        alt=""
        width={size}
        height={size}
        draggable={false}
        onError={() => setFailedUrl(src)}
      />
    );
  }
  return (
    <span className="mc-pin-letter" aria-hidden="true" style={{ width: size, height: size }}>
      {pinLabel(link).slice(0, 1).toUpperCase()}
    </span>
  );
};

export default PinIcon;
