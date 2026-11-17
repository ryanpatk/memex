import { memo, useCallback, useMemo, useState, type CSSProperties } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import {
  type LinkWithTag,
  type NoteWithTags,
  type SelfMessage,
  type TaskWithTags,
  dueLabel,
  getLinkTitle,
  hostOf,
  isOverdue,
  daysUntilDue,
  itemKey,
  markdownExcerpt,
  noteDisplayTitle,
} from '@memex/core';
import { guessImageRatio } from '../../utils/imageRatios';
import { MC_MAX_PICTURE_RATIO } from '../../utils/memoryCardEstimates';
import { useImageRatio } from '../../hooks/useImageRatio';
import { useShownRatio } from '../../hooks/useShownRatio';
import { handleBackgroundLinkClick } from '../../utils/openUrlInBackgroundTab';
import MemoryCard from './MemoryCard';
import { linkLabelMeta } from './cardMeta';
import type { CardLabel } from './LabelStrip';

const agentOf = (row: { captured_by?: string | null; captured_client?: string | null }) =>
  row.captured_by === 'agent' ? row.captured_client || 'Agent' : null;

const timeOf = (iso: string) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

/* ---------- Link ---------- */

interface LinkMemoryCardProps {
  link: LinkWithTag;
  label: CardLabel;
  onActivate: (link: LinkWithTag) => void;
  /** The picture failed: the page shows the link without a picture instead. */
  onImageError?: (linkId: string) => void;
  /** Show the picture (the page passes false once it has failed). */
  withPicture?: boolean;
  selected?: boolean;
  selectionMode?: boolean;
  pinned?: boolean;
}

/**
 * A link: with a picture (the picture leads; the card stays white) or without
 * (a favicon block). The picture's box is sized before the picture arrives,
 * from its remembered or guessed ratio, and only changes size below the
 * viewport, so the grid never shifts as pictures load (same as the classic
 * LinkPreviewCard, docs/library-grid-performance.md).
 */
const LinkMemoryCardBase = ({
  link,
  label,
  onActivate,
  onImageError,
  withPicture = true,
  selected = false,
  selectionMode = false,
  pinned = false,
}: LinkMemoryCardProps) => {
  const title = getLinkTitle(link);
  const imageUrl = withPicture ? (link.preview_image_url ?? '') : '';
  const meta = useMemo(() => linkLabelMeta(link), [link]);
  const host = useMemo(() => hostOf(link.url), [link.url]);
  const { ratio, imageRef } = useImageRatio(imageUrl);
  const [shownRatio, holdRef] = useShownRatio(imageUrl, ratio ?? guessImageRatio(link.url, link.source));
  const [loaded, setLoaded] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);

  const reveal = useCallback((img: HTMLImageElement) => {
    if (typeof img.decode !== 'function') return setLoaded(true);
    img.decode().then(
      () => setLoaded(true),
      () => setLoaded(true),
    );
  }, []);
  const setImage = useCallback(
    (node: HTMLImageElement | null) => {
      imageRef(node);
      if (node?.complete && node.naturalWidth > 0) setLoaded(true);
    },
    [imageRef],
  );

  const top = imageUrl ? (
    <img
      ref={setImage}
      className={`mc-card-pic${loaded ? ' is-loaded' : ''}`}
      src={imageUrl}
      alt=""
      decoding="async"
      // Picture cards hold the same 28px card at a 12px inset: the picture
      // box keeps its ratio, clamped so one tall pin can’t fill a column
      style={{ aspectRatio: `1 / ${Math.min(MC_MAX_PICTURE_RATIO, Math.max(0.45, shownRatio))}` } as CSSProperties}
      onLoad={(event) => reveal(event.currentTarget)}
      onError={() => onImageError?.(link.id)}
    />
  ) : (
    <span className="mc-card-fav" aria-hidden="true">
      {link.favicon_url && !faviconFailed ? (
        <img src={link.favicon_url} alt="" width={28} height={28} decoding="async" onError={() => setFaviconFailed(true)} />
      ) : (
        host.slice(0, 1).toUpperCase()
      )}
    </span>
  );

  return (
    <MemoryCard
      kind={imageUrl ? 'picture' : 'link'}
      rootRef={imageUrl ? holdRef : undefined}
      title={title}
      label={label}
      meta={meta}
      itemKey={itemKey('link', link.id)}
      onActivate={() => onActivate(link)}
      selected={selected}
      selectionMode={selectionMode}
      isNew={link.id.startsWith('temp-')}
      pinned={pinned}
      agent={agentOf(link)}
      top={top}
      ariaLabel={selectionMode ? `Select ${title}` : `Open card: ${title}`}
      actions={
        <a
          className="mc-rb is-small"
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleBackgroundLinkClick}
          aria-label={`Open ${title} in a new tab`}
          title="Open link"
        >
          <ExternalLink aria-hidden="true" />
        </a>
      }
    />
  );
};

export const LinkMemoryCard = memo(LinkMemoryCardBase);

/* ---------- Note ---------- */

interface NoteMemoryCardProps {
  note: NoteWithTags;
  label: CardLabel;
  onActivate: (note: NoteWithTags) => void;
  selected?: boolean;
  selectionMode?: boolean;
}

/** A note: tinted from its space's colour, the title big, a short excerpt. */
const NoteMemoryCardBase = ({ note, label, onActivate, selected = false, selectionMode = false }: NoteMemoryCardProps) => {
  const title = noteDisplayTitle(note);
  const excerpt = useMemo(() => {
    const text = markdownExcerpt(note.body, 220);
    // The title is the note's first line: don't say it twice
    return text.startsWith(title) ? text.slice(title.length).trim() : text;
  }, [note.body, title]);
  return (
    <MemoryCard
      kind="note"
      title={title}
      excerpt={excerpt || undefined}
      label={label}
      meta="note"
      itemKey={itemKey('note', note.id)}
      onActivate={() => onActivate(note)}
      selected={selected}
      selectionMode={selectionMode}
      isNew={note.id.startsWith('temp-')}
      agent={agentOf(note)}
      ariaLabel={selectionMode ? `Select ${title}` : `Open note: ${title}`}
    />
  );
};

export const NoteMemoryCard = memo(NoteMemoryCardBase);

/* ---------- Task ---------- */

export const DueChip = ({ due, done = false }: { due: string | null | undefined; done?: boolean }) => {
  const text = dueLabel(due);
  if (!text) return null;
  const days = daysUntilDue(due);
  const late = !done && isOverdue({ is_done: done, due_date: due ?? null });
  return <span className={`mc-due${late ? ' is-late' : days === 0 && !done ? ' is-today' : ''}`}>{text}</span>;
};

interface TaskMemoryCardProps {
  task: TaskWithTags;
  label: CardLabel;
  onToggleDone: (task: TaskWithTags) => void;
  onActivate?: (task: TaskWithTags) => void;
  selected?: boolean;
  selectionMode?: boolean;
}

/** A task as a card: a big check, the title, its due chip. */
const TaskMemoryCardBase = ({
  task,
  label,
  onToggleDone,
  onActivate,
  selected = false,
  selectionMode = false,
}: TaskMemoryCardProps) => (
  <MemoryCard
    kind="task"
    title={task.title}
    label={label}
    meta="task"
    itemKey={itemKey('task', task.id)}
    onActivate={onActivate ? () => onActivate(task) : undefined}
    selected={selected}
    selectionMode={selectionMode}
    isNew={task.id.startsWith('temp-')}
    agent={agentOf(task)}
    done={task.is_done}
    ariaLabel={selectionMode ? `Select ${task.title}` : undefined}
    leading={
      <button
        type="button"
        role="checkbox"
        aria-checked={task.is_done}
        className="mc-chk is-large"
        onClick={() => onToggleDone(task)}
        aria-label={task.is_done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
      >
        <Check aria-hidden="true" />
      </button>
    }
    below={<DueChip due={task.due_date} done={task.is_done} />}
  />
);

export const TaskMemoryCard = memo(TaskMemoryCardBase);

/* ---------- Jot ---------- */

interface JotMemoryCardProps {
  jot: SelfMessage;
  label: CardLabel;
  onActivate?: (jot: SelfMessage) => void;
  selected?: boolean;
  selectionMode?: boolean;
}

/** A jot: full colour, the words big, the time on the label. */
const JotMemoryCardBase = ({ jot, label, onActivate, selected = false, selectionMode = false }: JotMemoryCardProps) => (
  <MemoryCard
    kind="jot"
    title={jot.body}
    label={label}
    meta={timeOf(jot.created_at)}
    itemKey={`jot:${jot.id}`}
    onActivate={onActivate ? () => onActivate(jot) : undefined}
    selected={selected}
    selectionMode={selectionMode}
    isNew={jot.id.startsWith('temp-')}
    agent={agentOf(jot)}
  />
);

export const JotMemoryCard = memo(JotMemoryCardBase);
