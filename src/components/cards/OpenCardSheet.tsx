import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowUpRight,
  Copy,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { type LinkWithTag, getLinkTitle, hostOf, relativeTime } from '@memex/core';
import { useProfiles } from '../../hooks/useProfiles';
import { useSpaceColors } from '../../hooks/useSpaceColors';
import { useProfileLinkMembership } from '../../hooks/useProfileLinks';
import { cue } from '../../utils/sound';
import type { RescrapeResult } from '../stream/LinkExpandedCard';
import EditLinkSheet from './EditLinkSheet';
import Menu from './Menu';
import Sheet from './Sheet';
import SpacePill from './SpacePill';

const RESCRAPE_COPY: Record<RescrapeResult, string> = {
  updated: 'Preview refreshed.',
  unchanged: 'The preview is already up to date.',
  failed: 'Couldn’t refresh the preview.',
};

interface OpenCardSheetProps {
  link: LinkWithTag | null;
  onClose: () => void;
  isPinned: boolean;
  onTogglePin: (next: boolean) => Promise<void>;
  onOpen: () => void;
  onRescrape: () => Promise<RescrapeResult>;
  onDelete: () => void;
  /** “+ Space” and the space pills: file it (the Move sheet). */
  onMove: () => void;
  onFeedback: (message: string) => void;
}

/**
 * The open card (d11, decision 4): a centred card sheet in place of the 3C
 * in-place expand. Picture on the left, then the card's space pills with
 * “+ Space”, the title big, host and saved date, the description, one
 * primary action (Open) and ••• for the rest: Copy link, Pin to top,
 * Refresh preview, Edit…, Delete. A label edge in the space's colour runs
 * along the sheet's foot.
 */
const OpenCardSheet = ({
  link,
  onClose,
  isPinned,
  onTogglePin,
  onOpen,
  onRescrape,
  onDelete,
  onMove,
  onFeedback,
}: OpenCardSheetProps) => {
  const { data: profiles } = useProfiles();
  const colors = useSpaceColors();
  const { data: membership } = useProfileLinkMembership();
  const [editing, setEditing] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const openRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    setEditing(false);
    setImageFailed(false);
  }, [link?.id]);

  const memberSpaces = useMemo(() => {
    if (!link) return [];
    const ids = new Set((membership ?? []).filter((row) => row.link_id === link.id).map((row) => row.profile_id));
    return (profiles ?? []).filter((space) => ids.has(space.id));
  }, [link, membership, profiles]);

  if (!link) return null;
  const title = getLinkTitle(link);
  const host = hostOf(link.url);
  const picture = link.preview_image_url && !imageFailed ? link.preview_image_url : null;
  const edgeColor = memberSpaces[0] ? colors.get(memberSpaces[0].id) : undefined;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      cue('confirm');
      onFeedback('Link copied.');
    } catch {
      onFeedback('Couldn’t copy the link.');
    }
  };

  const rescrape = async () => {
    onFeedback('Refreshing preview…');
    try {
      onFeedback(RESCRAPE_COPY[await onRescrape()]);
    } catch {
      onFeedback(RESCRAPE_COPY.failed);
    }
  };

  const togglePin = async () => {
    try {
      await onTogglePin(!isPinned);
      onFeedback(isPinned ? 'Unpinned.' : 'Pinned to the top.');
    } catch {
      cue('error');
      onFeedback('Couldn’t change the pin. Try again.');
    }
  };

  return (
    <>
      <Sheet open={!editing} onClose={onClose} label={title} width={1120} initialFocus={openRef} className="mc-open-card">
        <div className="mc-open" style={edgeColor ? ({ '--c': edgeColor } as CSSProperties) : undefined}>
          {picture ? (
            <img className="mc-open-pic" src={picture} alt="" onError={() => setImageFailed(true)} />
          ) : (
            <div className="mc-open-pic is-empty" aria-hidden="true">
              {host.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="mc-open-body">
            <div className="mc-open-spaces">
              {memberSpaces.map((space) => (
                <SpacePill
                  key={space.id}
                  name={space.name}
                  color={colors.get(space.id)}
                  size="xs"
                  selected
                  onClick={onMove}
                  ariaLabel={`In ${space.name}. Change spaces`}
                />
              ))}
              <button type="button" className="mc-pill is-add is-xs is-plain" onClick={onMove}>
                <Plus aria-hidden="true" width={18} height={18} /> Space
              </button>
            </div>
            <h2 className="mc-h1 mc-open-title">{title}</h2>
            <p className="mc-lab">
              <span translate="no">{host}</span> · saved {relativeTime(link.created_at)}
            </p>
            {link.description && <p className="mc-body mc-open-desc">{link.description}</p>}
            <div className="mc-open-actions">
              <a
                ref={openRef}
                className="mc-btn is-primary"
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onOpen()}
              >
                Open <ArrowUpRight aria-hidden="true" />
              </a>
              <Menu
                label="Card actions"
                align="start"
                entries={[
                  { id: 'copy', label: 'Copy link', icon: <Copy />, onSelect: () => void copy() },
                  {
                    id: 'pin',
                    label: isPinned ? 'Unpin' : 'Pin to top',
                    icon: isPinned ? <PinOff /> : <Pin />,
                    onSelect: () => void togglePin(),
                  },
                  { id: 'refresh', label: 'Refresh preview', icon: <RefreshCw />, onSelect: () => void rescrape() },
                  { id: 'edit', label: 'Edit…', icon: <Pencil />, onSelect: () => setEditing(true) },
                  { kind: 'separator', id: 'sep' },
                  { id: 'delete', label: 'Delete', icon: <Trash2 />, danger: true, onSelect: onDelete },
                ]}
                trigger={(props) => (
                  <button {...props} type="button" className="mc-rb" aria-label="More actions">
                    <MoreHorizontal aria-hidden="true" />
                  </button>
                )}
              />
            </div>
          </div>
        </div>
      </Sheet>
      <EditLinkSheet
        open={editing}
        link={link}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onFeedback('Saved.');
        }}
      />
    </>
  );
};

export default OpenCardSheet;
