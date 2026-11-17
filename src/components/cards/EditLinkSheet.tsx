import { useEffect, useRef, useState } from 'react';
import { normalizeUrlInput, type LinkWithTag } from '@memex/core';
import { useUpdateLink } from '../../hooks/useLinks';
import { HANDLES_ERRORS } from '../../utils/mutationErrors';
import Sheet from './Sheet';

interface EditLinkSheetProps {
  link: LinkWithTag;
  open: boolean;
  onClose: () => void;
  /** After a save lands (for a toast). */
  onSaved?: () => void;
}

/**
 * Edit card (d13): the link, its title and why you saved it (the
 * description), Cancel and Save. Tags stay hidden, as everywhere today
 * (SHOW_TAGS_UI = false). Free text is accepted and checked on Save; a bad
 * link shows its error under the field and takes focus.
 */
const EditLinkSheet = ({ link, open, onClose, onSaved }: EditLinkSheetProps) => {
  const urlRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(link.url);
  const [title, setTitle] = useState(link.title ?? '');
  const [why, setWhy] = useState(link.description ?? '');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateLink(HANDLES_ERRORS);

  useEffect(() => {
    if (!open) return;
    setUrl(link.url);
    setTitle(link.title ?? '');
    setWhy(link.description ?? '');
    setUrlError(null);
    setError(null);
  }, [link, open]);

  const changed = url.trim() !== link.url || title.trim() !== (link.title ?? '') || why.trim() !== (link.description ?? '');

  const save = async () => {
    const normalized = normalizeUrlInput(url.trim());
    if (!normalized) {
      setUrlError('That doesn’t look like a link. Try something like example.com/page.');
      urlRef.current?.focus();
      return;
    }
    setUrlError(null);
    setError(null);
    if (!changed) {
      onClose();
      return;
    }
    try {
      await update.mutateAsync({
        id: link.id,
        updates: { url: normalized, title: title.trim(), description: why.trim() },
      });
      onSaved?.();
      onClose();
    } catch {
      setError('Couldn’t save. Check your connection and try again.');
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Edit card"
      width={700}
      initialFocus={titleRef}
      footer={
        <>
          <button type="button" className="mc-btn is-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="mc-edit-link" className="mc-btn is-primary" aria-busy={update.isPending || undefined} disabled={update.isPending}>
            Save
          </button>
        </>
      }
    >
      <form
        id="mc-edit-link"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="mc-flab" htmlFor="mc-edit-link-url">
          Link
        </label>
        <input
          ref={urlRef}
          id="mc-edit-link-url"
          name="url"
          type="url"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          className="mc-inp"
          value={url}
          aria-invalid={urlError ? true : undefined}
          aria-describedby={urlError ? 'mc-edit-link-url-error' : undefined}
          onChange={(event) => {
            setUrl(event.target.value);
            if (urlError) setUrlError(null);
          }}
        />
        {urlError && (
          <p className="mc-ferr" id="mc-edit-link-url-error">
            {urlError}
          </p>
        )}
        <label className="mc-flab" htmlFor="mc-edit-link-title">
          Title
        </label>
        <input
          ref={titleRef}
          id="mc-edit-link-title"
          name="title"
          className="mc-inp"
          autoComplete="off"
          placeholder="What it is…"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <label className="mc-flab" htmlFor="mc-edit-link-why">
          Why I saved this
        </label>
        <input
          id="mc-edit-link-why"
          name="description"
          className="mc-inp"
          autoComplete="off"
          placeholder="Optional note…"
          value={why}
          onChange={(event) => setWhy(event.target.value)}
        />
        {error && <p className="mc-ferr">{error}</p>}
      </form>
    </Sheet>
  );
};

export default EditLinkSheet;
