import { forwardRef, useId, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Plus } from 'lucide-react';
import { mentionQuery, parseTaskInput, type JournalSpace } from '@memex/core';

/*
 * The Tasks view's add field. Same syntax as the Journal composer
 * (@memex/core composer.ts): “@Space” files the task and opens the same
 * space picker; a leading “[] ” is fine but not needed here. When the page
 * is filtered to one space, a task with no @Space goes there.
 */

export interface TaskComposerHandle {
  focus: () => void;
}

interface TaskComposerProps {
  spaces: JournalSpace[];
  /** Where a task without @Space goes (the Space filter's one space). */
  defaultSpace?: JournalSpace;
  /** Resolves when saved; rejecting puts the text back. */
  onSubmit: (task: { title: string; spaces: JournalSpace[] }) => Promise<void>;
}

const TaskComposer = forwardRef<TaskComposerHandle, TaskComposerProps>(({ spaces, defaultSpace, onSubmit }, ref) => {
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [pickIndex, setPickIndex] = useState(0);
  const [pickerDismissed, setPickerDismissed] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const listId = useId();

  useImperativeHandle(ref, () => ({ focus: () => fieldRef.current?.focus() }), []);

  const parsed = useMemo(() => parseTaskInput(text, spaces), [spaces, text]);
  const filing = parsed?.spaces.length ? parsed.spaces : defaultSpace ? [defaultSpace] : [];

  const query = mentionQuery(text.slice(0, caret));
  const matches = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return spaces.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, spaces]);
  const mentionComplete = query !== null && spaces.some((s) => s.name.toLowerCase() === query.trim().toLowerCase());
  const pickerOpen = !pickerDismissed && !mentionComplete && query !== null && matches.length > 0;
  const activeIndex = Math.min(pickIndex, Math.max(matches.length - 1, 0));

  const syncCaret = () => setCaret(fieldRef.current?.selectionStart ?? 0);

  const pick = (space: JournalSpace) => {
    if (query === null) return;
    const before = text.slice(0, caret - query.length - 1);
    const after = text.slice(caret);
    const insert = `@${space.name} `;
    setText(`${before}${insert}${after.replace(/^\s+/, '')}`);
    const pos = before.length + insert.length;
    requestAnimationFrame(() => {
      fieldRef.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  };

  const submit = () => {
    if (!parsed) return;
    const saved = text;
    setText('');
    setCaret(0);
    onSubmit({ title: parsed.title, spaces: filing }).catch(() => setText((current) => current || saved));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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
    if (event.key === 'Escape') {
      event.preventDefault();
      if (text) setText('');
      else fieldRef.current?.blur();
      return;
    }
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="tk-composer">
      <div className="tk-composer-field">
        <Plus aria-hidden="true" className="tk-composer-plus" />
        <input
          ref={fieldRef}
          className="tk-composer-input"
          value={text}
          placeholder="Add a task… “@space” files it"
          aria-label="Add a task"
          aria-describedby={hintId}
          aria-autocomplete="list"
          aria-expanded={pickerOpen}
          aria-controls={pickerOpen ? listId : undefined}
          aria-activedescendant={pickerOpen ? `${listId}-${activeIndex}` : undefined}
          role="combobox"
          autoComplete="off"
          enterKeyHint="done"
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
        <button type="button" className="btn-primary btn-compact tk-composer-send" disabled={!parsed} onClick={submit}>
          Add
        </button>
      </div>
      {pickerOpen && (
        <div className="memex-menu tk-picker" role="listbox" id={listId} aria-label="Spaces">
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
      <p className="tk-composer-hint" id={hintId}>
        <span>
          <kbd className="memex-kbd">↵</kbd> add task
        </span>
        <span>
          <kbd className="memex-kbd">@</kbd> file in a space
        </span>
        {filing.length > 0 && (
          <span className="tk-composer-filing">
            → {filing.map((s) => s.name).join(', ')}
          </span>
        )}
      </p>
    </div>
  );
});

TaskComposer.displayName = 'TaskComposer';

export default TaskComposer;
