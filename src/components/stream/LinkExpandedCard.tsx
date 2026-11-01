import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowUpRight,
  Check,
  Copy,
  Ellipsis,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import {
  type LinkWithTag,
  getHostname,
  getLinkTitle,
  relativeTime,
  isUrlLike,
  normalizeUrlInput,
} from '@memex/core';
import { useProfiles } from '../../hooks/useProfiles';
import {
  useAddLinksToProfile,
  useProfileLinkMembership,
  useRemoveLinkFromProfile,
} from '../../hooks/useProfileLinks';
import { useSpaceColors } from '../../hooks/useSpaceColors';
import { cue } from '../../utils/sound';

export type RescrapeResult = 'updated' | 'unchanged' | 'failed';

interface LinkExpandedCardProps {
  link: LinkWithTag;
  isPinned: boolean;
  onTogglePin: (next: boolean) => Promise<void>;
  onOpen: () => void;
  onClose: () => void;
  onUpdateUrl: (url: string) => Promise<void>;
  onRescrape: () => Promise<RescrapeResult>;
  onDelete: () => void;
  /** Compact layout for the list view (no hero image). */
  variant?: 'card' | 'row';
}

const RESCRAPE_COPY: Record<RescrapeResult, string> = {
  updated: 'Preview refreshed',
  unchanged: 'Already up to date',
  failed: 'Couldn’t reach the page',
};

/**
 * A link opened in place (3C): the card grows to two columns inside the
 * stream and shows the preview, Open/Copy/Pin, and the spaces it lives in.
 * Editing, refreshing, and deleting sit behind the ··· menu.
 */
const LinkExpandedCard = ({
  link,
  isPinned,
  onTogglePin,
  onOpen,
  onClose,
  onUpdateUrl,
  onRescrape,
  onDelete,
  variant = 'card',
}: LinkExpandedCardProps) => {
  const rootRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlDraft, setUrlDraft] = useState(link.url);
  const [status, setStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const { data: profiles } = useProfiles();
  const spaceColors = useSpaceColors();
  const { data: membership } = useProfileLinkMembership();
  const addToSpace = useAddLinksToProfile();
  const removeFromSpace = useRemoveLinkFromProfile();

  const host = getHostname(link.url);
  const title = getLinkTitle(link);

  const memberIds = useMemo(
    () =>
      new Set(
        (membership ?? []).filter((row) => row.link_id === link.id).map((row) => row.profile_id),
      ),
    [link.id, membership],
  );
  const memberSpaces = (profiles ?? []).filter((p) => memberIds.has(p.id));
  const otherSpaces = (profiles ?? []).filter((p) => !memberIds.has(p.id));

  // Bring the card into view and focus it for keyboard/screen-reader users
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    const timer = window.setTimeout(
      () => node.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
      120,
    );
    return () => window.clearTimeout(timer);
  }, []);

  // Escape closes the open popover first, then the card
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (menuOpen || addOpen) {
        setMenuOpen(false);
        setAddOpen(false);
        return;
      }
      if (editingUrl) {
        setEditingUrl(false);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addOpen, editingUrl, menuOpen, onClose]);

  // Popovers dismiss on outside click
  useEffect(() => {
    if (!menuOpen && !addOpen) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuOpen && !menuRef.current?.contains(target)) setMenuOpen(false);
      if (addOpen && !addRef.current?.contains(target)) setAddOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [addOpen, menuOpen]);

  useEffect(() => {
    setUrlDraft(link.url);
  }, [link.url]);

  const flashStatus = (message: string) => {
    setStatus(message);
    window.setTimeout(() => setStatus((current) => (current === message ? null : current)), 2600);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      cue('confirm');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      flashStatus('Couldn’t copy');
    }
  };

  const handleRescrape = async () => {
    setMenuOpen(false);
    flashStatus('Refreshing preview…');
    try {
      flashStatus(RESCRAPE_COPY[await onRescrape()]);
    } catch {
      flashStatus(RESCRAPE_COPY.failed);
    }
  };

  const handleSaveUrl = async (event: FormEvent) => {
    event.preventDefault();
    const next = normalizeUrlInput(urlDraft.trim());
    if (!next || !isUrlLike(urlDraft.trim())) {
      flashStatus('That doesn’t look like a URL');
      return;
    }
    if (next !== link.url) {
      await onUpdateUrl(next);
      flashStatus('URL saved');
    }
    setEditingUrl(false);
  };

  const hasImage = variant === 'card' && Boolean(link.preview_image_url) && !imageFailed;

  return (
    <article
      ref={rootRef}
      className={`memex-expanded memex-expanded--${variant}`}
      tabIndex={-1}
      aria-label={`${title} — details`}
    >
      {hasImage && (
        <div className="memex-expanded-media">
          <img src={link.preview_image_url} alt="" onError={() => setImageFailed(true)} />
          {/* Same corner as the collapsed card's open-link button */}
          <button
            type="button"
            className="memex-pv-action memex-expanded-media-close"
            onClick={onClose}
            aria-label="Close details"
            title="Close"
          >
            <X aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="memex-expanded-body">
        <div className="memex-expanded-top">
          <span className="memex-expanded-meta">
            {link.favicon_url && (
              <img className="memex-expanded-favicon" src={link.favicon_url} alt="" />
            )}
            <span translate="no">{host}</span>
            <span aria-hidden="true">·</span>
            <span>Saved {relativeTime(link.created_at)}</span>
          </span>

          <div className="memex-expanded-tools">
            <div className="memex-popover-anchor" ref={menuRef}>
              <button
                type="button"
                className="memex-icon-button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="More actions"
              >
                <Ellipsis aria-hidden="true" />
              </button>
              {menuOpen && (
                <div className="memex-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setEditingUrl(true);
                    }}
                  >
                    <Pencil aria-hidden="true" /> Edit URL…
                  </button>
                  <button type="button" role="menuitem" onClick={() => void handleRescrape()}>
                    <RefreshCw aria-hidden="true" /> Refresh preview
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="is-danger"
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                  >
                    <Trash2 aria-hidden="true" /> Delete
                  </button>
                </div>
              )}
            </div>
            {!hasImage && (
              <button
                type="button"
                className="memex-icon-button"
                onClick={onClose}
                aria-label="Close details"
              >
                <X aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <h2 className="memex-expanded-title">{title}</h2>
        {link.description && <p className="memex-expanded-desc">{link.description}</p>}

        {editingUrl ? (
          <form className="memex-expanded-url" onSubmit={(event) => void handleSaveUrl(event)}>
            <input
              className="input-field"
              type="url"
              inputMode="url"
              value={urlDraft}
              onChange={(event) => setUrlDraft(event.target.value)}
              aria-label="Link URL"
              spellCheck={false}
              autoComplete="off"
              autoFocus
            />
            <button type="submit" className="btn-primary btn-compact">
              Save
            </button>
            <button
              type="button"
              className="btn-secondary btn-compact"
              onClick={() => {
                setUrlDraft(link.url);
                setEditingUrl(false);
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <div className="memex-expanded-actions">
            <button type="button" className="btn-primary btn-compact" onClick={onOpen}>
              Open <ArrowUpRight aria-hidden="true" />
            </button>
            <button type="button" className="btn-secondary btn-compact" onClick={() => void handleCopy()}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              type="button"
              className={`memex-pin-toggle${isPinned ? ' is-on' : ''}`}
              onClick={() => void onTogglePin(!isPinned)}
              aria-pressed={isPinned}
              title={isPinned ? 'Unpin from header' : 'Pin to header'}
            >
              <Pin aria-hidden="true" />
              <span>{isPinned ? 'Pinned' : 'Pin'}</span>
            </button>
          </div>
        )}

        <div className="memex-expanded-section">
          <span className="memex-expanded-label">Spaces</span>
          <div className="memex-expanded-chips">
            {memberSpaces.map((space) => (
              <span key={space.id} className="memex-space-chip">
                <span
                  className="memex-space-dot"
                  style={{ background: spaceColors.get(space.id) }}
                  aria-hidden="true"
                />
                {space.name}
                <button
                  type="button"
                  className="memex-space-chip-remove"
                  onClick={() => {
                    cue('move');
                    void removeFromSpace.mutateAsync({ profileId: space.id, linkId: link.id });
                  }}
                  aria-label={`Remove from “${space.name}”`}
                >
                  <X aria-hidden="true" />
                </button>
              </span>
            ))}
            {otherSpaces.length > 0 && (
              <div className="memex-popover-anchor" ref={addRef}>
                <button
                  type="button"
                  className="memex-space-chip is-add"
                  onClick={() => setAddOpen((open) => !open)}
                  aria-haspopup="menu"
                  aria-expanded={addOpen}
                >
                  <Plus aria-hidden="true" /> {memberSpaces.length ? 'Add' : 'Add to a space'}
                </button>
                {addOpen && (
                  <div className="memex-menu" role="menu">
                    {otherSpaces.map((space) => (
                      <button
                        key={space.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setAddOpen(false);
                          cue('move');
                          void addToSpace.mutateAsync({ profileId: space.id, linkIds: [link.id] });
                        }}
                      >
                        <span
                          className="memex-space-dot"
                          style={{ background: spaceColors.get(space.id) }}
                          aria-hidden="true"
                        />
                        {space.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="memex-expanded-status" role="status" aria-live="polite">
          {status}
        </p>
      </div>
    </article>
  );
};

export default LinkExpandedCard;
