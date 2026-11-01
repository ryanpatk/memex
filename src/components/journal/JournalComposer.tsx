import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { ArrowUp } from 'lucide-react';
import { mentionQuery, parseComposer, type ComposerResult, type JournalSpace } from '@memex/core';

/*
 * The Journal composer: one field at the bottom of the feed. What you type
 * decides what Enter makes (utils/composer.ts): a jot, a link for a lone
 * URL, a task after "[] ", a note with ⌘/Ctrl+Enter; "@Space" files it.
 * The hint under the field always says what Enter will do.
 */

interface JournalComposerProps {
  spaces: JournalSpace[];
  /** Resolves when saved; rejecting puts the text back. */
  onSubmit: (result: Exclude<ComposerResult, { kind: 'empty' }>) => Promise<void>;
}

const ENTER_LABEL: Record<Exclude<ComposerResult['kind'], 'empty'>, string> = {
  jot: 'jot',
  link: 'save link',
  task: 'add task',
  note: 'note',
};

const SEND_LABEL: Record<Exclude<ComposerResult['kind'], 'empty'>, string> = {
  jot: 'Send jot',
  link: 'Save link',
  task: 'Add task',
  note: 'Save note',
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

const JournalComposer = ({ spaces, onSubmit }: JournalComposerProps) => {
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [pickIndex, setPickIndex] = useState(0);
  const [pickerDismissed, setPickerDismissed] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  const listId = useId();

  const parsed = useMemo(() => parseComposer(text, spaces), [spaces, text]);

  const query = mentionQuery(text.slice(0, caret));
  const matches = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return spaces.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, spaces]);
  // A finished mention ("@Finances") closes the picker so Enter sends
  const mentionComplete = query !== null && spaces.some((s) => s.name.toLowerCase() === query.trim().toLowerCase());
  const pickerOpen = !pickerDismissed && !mentionComplete && query !== null && matches.length > 0;
  const activeIndex = Math.min(pickIndex, Math.max(matches.length - 1, 0));

  // Grow with the text up to the CSS max-height
  useLayoutEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const syncCaret = () => setCaret(fieldRef.current?.selectionStart ?? 0);

  const pick = (space: JournalSpace) => {
    if (query === null) return;
    const before = text.slice(0, caret - query.length - 1);
    const after = text.slice(caret);
    const insert = `@${space.name} `;
    const next = `${before}${insert}${after.replace(/^\s+/, '')}`;
    setText(next);
    const pos = before.length + insert.length;
    requestAnimationFrame(() => {
      fieldRef.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  const submit = (asNote: boolean) => {
    const result = asNote ? parseComposer(text, spaces, true) : parsed;
    if (result.kind === 'empty') return;
    const saved = text;
    setText('');
    setCaret(0);
    onSubmit(result).catch(() => setText((current) => current || saved));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (pickerOpen) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        setPickIndex((activeIndex + delta + matches.length) % matches.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        pick(matches[activeIndex]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setPickerDismissed(true);
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit(event.metaKey || event.ctrlKey);
    }
  };

  const enterKind = parsed.kind === 'empty' ? 'jot' : parsed.kind;

  return (
    <div className="jr-composer">
      {pickerOpen && (
        <div className="memex-menu jr-picker" role="listbox" id={listId} aria-label="Spaces">
          {matches.map((space, i) => (
            <button
              key={space.id}
              type="button"
              role="option"
              id={`${listId}-${i}`}
              aria-selected={i === activeIndex}
              className={i === activeIndex ? 'is-active' : undefined}
              style={{ '--hue': space.color } as CSSProperties}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(space)}
            >
              <i className="jr-dot" aria-hidden="true" />
              {space.name}
            </button>
          ))}
        </div>
      )}
      <div className="jr-composer-field">
        <textarea
          ref={fieldRef}
          className="jr-composer-input"
          rows={1}
          value={text}
          placeholder="Write a jot, paste a link, “[] ” for a task, @space to file…"
          aria-label="Write in your Journal"
          aria-describedby={hintId}
          aria-autocomplete="list"
          aria-expanded={pickerOpen}
          aria-controls={pickerOpen ? listId : undefined}
          aria-activedescendant={pickerOpen ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off"
          spellCheck
          onChange={(event) => {
            setText(event.target.value);
            setCaret(event.target.selectionStart ?? 0);
            setPickIndex(0);
            setPickerDismissed(false);
          }}
          onKeyDown={handleKeyDown}
          onSelect={syncCaret}
          onClick={syncCaret}
        />
        <button
          type="button"
          className="btn-primary jr-send"
          aria-label={parsed.kind === 'empty' ? 'Send' : SEND_LABEL[enterKind]}
          onClick={() => (parsed.kind === 'empty' ? fieldRef.current?.focus() : submit(false))}
        >
          <ArrowUp aria-hidden="true" />
        </button>
      </div>
      <p className="jr-hint" id={hintId}>
        <span>
          <kbd className="memex-kbd">↵</kbd> {ENTER_LABEL[enterKind]}
        </span>
        <span>
          <kbd className="memex-kbd">{isMac ? '⌘' : 'Ctrl'}&nbsp;↵</kbd> note
        </span>
        <span>
          <kbd className="memex-kbd">⇧&nbsp;↵</kbd> new line
        </span>
        {parsed.spaces.length > 0 && (
          <span className="jr-hint-spaces">
            → {parsed.spaces.map((s) => s.name).join(', ')}
          </span>
        )}
      </p>
    </div>
  );
};

export default JournalComposer;
