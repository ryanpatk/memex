import { useMemo } from 'react';
import {
  NoteWithTags,
  markdownExcerpt,
  noteDisplayTitle,
  noteAsUrl,
  relativeTime,
  itemKey,
  mergeTags,
} from '@memex/core';
import StreamCard from './StreamCard';
import { NoteGlyph } from './StreamGlyphs';
import { Link, X } from 'lucide-react';

interface NoteGridCardProps {
  note: NoteWithTags;
  onOpen: (note: NoteWithTags) => void;
  onDelete?: (noteId: string) => void;
  /** Shown only when the note is a lone URL; receives the normalized URL. */
  onConvertToLink?: (note: NoteWithTags, url: string) => void;
  hideActions?: boolean;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (noteId: string) => void;
}

/** Note as a stream card: note glyph + last edited, title, excerpt, tags. */
const NoteGridCard = ({
  note,
  onOpen,
  onDelete,
  onConvertToLink,
  hideActions = false,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
}: NoteGridCardProps) => {
  const tags = useMemo(() => mergeTags(note.note_tags, note.tags), [note]);
  const title = noteDisplayTitle(note);
  const excerpt = useMemo(() => markdownExcerpt(note.body, 420), [note.body]);
  const convertibleUrl = useMemo(() => noteAsUrl(note), [note]);
  const showConvert =
    !hideActions && Boolean(onConvertToLink) && convertibleUrl !== '' && !note.id.startsWith('temp-');

  const activate = () => {
    if (selectionMode) {
      onToggleSelect?.(note.id);
      return;
    }
    onOpen(note);
  };

  return (
    <StreamCard
      type="note"
      itemKey={itemKey('note', note.id)}
      isNew={note.id.startsWith('temp-')}
      leading={<NoteGlyph />}
      meta={relativeTime(note.updated_at)}
      metaTitle={new Date(note.updated_at).toLocaleString()}
      title={title}
      excerpt={excerpt || undefined}
      tags={tags}
      onActivate={activate}
      isSelected={isSelected}
      selectionMode={selectionMode}
      actions={
        !hideActions && (onDelete || showConvert) ? (
          <>
            {showConvert && (
              <button
                type="button"
                className="memex-icon-button"
                onClick={(event) => {
                  event.stopPropagation();
                  onConvertToLink?.(note, convertibleUrl);
                }}
                aria-label={`Convert “${title}” to a link`}
                title="Convert to link"
              >
                <Link aria-hidden="true" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="memex-icon-button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(note.id);
                }}
                aria-label={`Delete “${title}”`}
                title="Delete note"
              >
                <X aria-hidden="true" />
              </button>
            )}
          </>
        ) : undefined
      }
    />
  );
};

export default NoteGridCard;
