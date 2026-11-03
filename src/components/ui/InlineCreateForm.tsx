import { useEffect, useRef, useState } from 'react';

interface InlineCreateFormProps {
  placeholder: string;
  pending?: boolean;
  submitLabel?: string;
  onSubmit: (name: string) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Inline "new item" form used at the foot of filter rails (new space, new
 * tag). Owns its text state; the parent owns visibility.
 */
const InlineCreateForm = ({
  placeholder,
  pending = false,
  submitLabel = 'Add',
  onSubmit,
  onCancel,
}: InlineCreateFormProps) => {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  const handleSubmit = () => {
    const name = value.trim();
    if (!name) {
      return;
    }
    // The parent reports a failure (and keeps the form open); never leave the rejection unhandled
    Promise.resolve()
      .then(() => onSubmit(name))
      .catch((error: unknown) => console.error('Inline create failed:', error));
  };

  return (
    <div className="bookmark-profile-create">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            handleSubmit();
          }
          if (event.key === 'Escape') {
            onCancel();
          }
        }}
        placeholder={placeholder}
        className="bookmark-profile-create-input"
        disabled={pending}
      />
      <div className="bookmark-profile-create-actions">
        <button
          type="button"
          className="bookmark-profile-create-button is-primary"
          onClick={handleSubmit}
          disabled={!value.trim() || pending}
        >
          {submitLabel}
        </button>
        <button type="button" className="bookmark-profile-create-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
};

export default InlineCreateForm;
