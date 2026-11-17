import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { hostOf, parseComposer, type Profile } from '@memex/core';
import { captureTitle, detectCaptureKind, type CaptureKind } from './captureKind';
import { useCreateLink } from '../../hooks/useLinks';
import { useCreateNote } from '../../hooks/useNotes';
import { useCreateTask } from '../../hooks/useTasks';
import { useCreateSelfMessage } from '../../hooks/useSelfMessages';
import { useAddLinksToProfile } from '../../hooks/useProfileLinks';
import { useAddNotesToProfile } from '../../hooks/useProfileNotes';
import { useAddTasksToProfile } from '../../hooks/useProfileTasks';
import { useSpaceColors } from '../../hooks/useSpaceColors';
import { HANDLES_ERRORS } from '../../utils/mutationErrors';
import type { ToastAction } from '../../hooks/useFeedbackToast';
import { cue } from '../../utils/sound';
import { ToggleGroup } from './Controls';
import LabelStrip from './LabelStrip';
import Sheet from './Sheet';
import SpacePill from './SpacePill';

const KIND_OPTIONS = [
  { value: 'jot', label: 'Jot' },
  { value: 'note', label: 'Note' },
  { value: 'task', label: 'Task' },
] as const;

interface CaptureSheetProps {
  open: boolean;
  onClose: () => void;
  /** What was typed in the field when the sheet opened. */
  initialText: string;
  spaces: Profile[];
  /** The space chosen on the page (the filled pill), pre-selected here. */
  defaultSpaceId: string | null;
  onFeedback: (message: string, action?: ToastAction) => void;
  /** The capture didn't save: the page puts the text back. */
  onFailed?: (text: string) => void;
}

/**
 * “Save something” (d18–d20): the text, a Jot · Note · Task switch (a lone
 * URL is a link), “Put it in” space choices, and “Your card” — a live
 * preview of the card about to be written, whose label takes the chosen
 * space's colour. Enter saves (⌘Enter as a note), Esc closes. Same syntax
 * as the Journal composer: `[] ` makes a task, `@Space` files it.
 */
const CaptureSheet = ({ open, onClose, initialText, spaces, defaultSpaceId, onFeedback, onFailed }: CaptureSheetProps) => {
  const [text, setText] = useState(initialText);
  const [kindOverride, setKindOverride] = useState<CaptureKind | null>(null);
  const [spaceId, setSpaceId] = useState<string | null>(defaultSpaceId);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const colors = useSpaceColors();

  const createLink = useCreateLink(HANDLES_ERRORS);
  const createNote = useCreateNote(HANDLES_ERRORS);
  const createTask = useCreateTask(HANDLES_ERRORS);
  const createJot = useCreateSelfMessage(HANDLES_ERRORS);
  const addLinks = useAddLinksToProfile(HANDLES_ERRORS);
  const addNotes = useAddNotesToProfile(HANDLES_ERRORS);
  const addTasks = useAddTasksToProfile(HANDLES_ERRORS);

  useEffect(() => {
    if (!open) return;
    setText(initialText);
    setKindOverride(null);
    setBusy(false);
    // An @mention in the text picks the space; otherwise the page's choice
    const mentioned = parseComposer(initialText, spaces).spaces[0]?.id;
    setSpaceId(mentioned ?? defaultSpaceId);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [defaultSpaceId, initialText, open, spaces]);

  const detected = useMemo(() => detectCaptureKind(text, spaces), [spaces, text]);
  const kind: CaptureKind = detected === 'link' ? 'link' : (kindOverride ?? detected);
  const parsed = useMemo(() => parseComposer(text, spaces, kind === 'note'), [kind, spaces, text]);
  const title = captureTitle(parsed, kind);
  const space = spaces.find((s) => s.id === spaceId) ?? null;
  const label = { name: space?.name ?? null, color: space ? (colors.get(space.id) ?? null) : null, extra: 0 };
  const canSave = parsed.kind !== 'empty' && !busy;

  const save = async (asNote = false) => {
    const finalKind: CaptureKind = asNote && kind !== 'link' ? 'note' : kind;
    const result = parseComposer(text, spaces, finalKind === 'note');
    if (result.kind === 'empty' || busy) return;
    setBusy(true);
    const where = space?.id ?? null;
    const typed = text;
    try {
      if (finalKind === 'link' && result.kind === 'link') {
        const link = await createLink.mutateAsync({ url: result.url });
        if (where) await addLinks.mutateAsync({ profileId: where, linkIds: [link.id] });
      } else if (finalKind === 'note') {
        const title = result.kind === 'note' ? result.title : captureTitle(result, 'note');
        const body = result.kind === 'note' ? result.body : '';
        const note = await createNote.mutateAsync({ title, body });
        if (where) await addNotes.mutateAsync({ profileId: where, noteIds: [note.id] });
      } else if (finalKind === 'task') {
        const title = result.kind === 'task' ? result.title : captureTitle(result, 'task');
        const task = await createTask.mutateAsync({ title });
        if (where) await addTasks.mutateAsync({ profileId: where, taskIds: [task.id] });
      } else {
        const body = result.kind === 'jot' ? result.body : captureTitle(result, 'jot');
        await createJot.mutateAsync({ body, profile_id: where, id: crypto.randomUUID() });
      }
      cue('confirm');
      onFeedback(space ? `Saved to ${space.name}.` : 'Saved.');
      onClose();
    } catch (error) {
      console.error('Capture failed:', error);
      cue('error');
      setBusy(false);
      onFeedback('Couldn’t save that. Your text is still here.');
      onFailed?.(typed);
    }
  };

  const pictureLike = kind === 'link';

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Save something"
      width={1040}
      initialFocus={inputRef}
      footer={
        <>
          <span className="mc-keyhint">
            <kbd className="mc-kb">↵</kbd> save · <kbd className="mc-kb">⌘↵</kbd> note · <kbd className="mc-kb">Esc</kbd> close
          </span>
          <button
            type="button"
            className="mc-btn is-primary"
            onClick={() => void save()}
            disabled={!canSave}
            aria-busy={busy || undefined}
          >
            Save
          </button>
        </>
      }
    >
      <div className="mc-capture">
        <div className="mc-capture-main">
          <label className="mc-sr-only" htmlFor="mc-capture-text">
            What to save
          </label>
          <textarea
            id="mc-capture-text"
            ref={inputRef}
            className="mc-inp mc-capture-text"
            value={text}
            rows={kind === 'note' ? 5 : 2}
            placeholder="Write a thought, paste a link, [] for a task…"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void save(event.metaKey || event.ctrlKey);
              }
            }}
          />
          {kind === 'link' ? (
            <p className="mc-lab mc-capture-kind">A link — saved with its picture and title.</p>
          ) : (
            <div className="mc-capture-kind">
              <ToggleGroup
                label="Save as"
                value={kind as 'jot' | 'note' | 'task'}
                options={KIND_OPTIONS}
                onChange={(value) => setKindOverride(value)}
              />
            </div>
          )}
          <p className="mc-flab" id="mc-capture-where">
            Put it in
          </p>
          <div className="mc-capture-spaces" role="radiogroup" aria-labelledby="mc-capture-where">
            {spaces.map((s) => (
              <SpacePill
                key={s.id}
                name={s.name}
                color={colors.get(s.id)}
                size="small"
                selected={s.id === spaceId}
                ariaPressed={s.id === spaceId}
                onClick={() => setSpaceId((current) => (current === s.id ? null : s.id))}
              />
            ))}
            {spaces.length === 0 && <p className="mc-lab">No spaces yet: it will be saved unfiled.</p>}
          </div>
        </div>
        <div className="mc-capture-preview" aria-live="polite">
          <p className="mc-flab">Your card</p>
          <div
            className={`mc-card is-${pictureLike ? 'picture' : kind}${!label.name && (kind === 'note' || kind === 'jot') ? ' is-unfiled-card' : ''}`}
            style={label.color ? ({ '--c': label.color } as CSSProperties) : undefined}
            aria-label={`Preview: ${title || 'empty card'}`}
          >
            {pictureLike && <span className="mc-card-pic mc-capture-pic is-loaded" aria-hidden="true" />}
            {kind === 'task' ? (
              <div className="mc-card-task">
                <span className="mc-chk is-large" aria-hidden="true" />
                <div>
                  <p className="mc-card-title">{title || 'Your task'}</p>
                </div>
              </div>
            ) : (
              <div className="mc-card-body">
                <p className="mc-card-title">{title || 'Your card'}</p>
              </div>
            )}
            <LabelStrip
              label={label}
              meta={
                kind === 'link' && parsed.kind === 'link'
                  ? hostOf(parsed.url)
                  : kind === 'jot'
                    ? new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date())
                    : kind
              }
            />
          </div>
        </div>
      </div>
    </Sheet>
  );
};

export default CaptureSheet;
