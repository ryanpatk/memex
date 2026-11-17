import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Visible heading; also the dialog's accessible name. */
  title?: ReactNode;
  /** Accessible name when there is no visible title. */
  label?: string;
  /** Max width in px (default 760). */
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  /** Element to focus on open (defaults to the first focusable inside). */
  initialFocus?: React.RefObject<HTMLElement | null>;
  /** Hide the round ✕ (the sheet still closes on Esc and the backdrop). */
  hideClose?: boolean;
  /** Title size: h1 (44px, capture and big sheets) or h2 (32px, settings-style sheets, d31/d32/d45). */
  titleSize?: 'h1' | 'h2';
}

/**
 * The Memory Cards sheet (s07): a native modal <dialog> — focus is trapped
 * and returned by the browser, Esc closes — with a 40px radius, a round ✕
 * hanging off its corner, and a dimmed, blurred page behind. Phones get a
 * bottom sheet (shell.css). Clicking the backdrop closes it.
 */
const Sheet = ({
  open,
  onClose,
  title,
  label,
  width,
  children,
  footer,
  className,
  initialFocus,
  hideClose = false,
  titleSize = 'h1',
}: SheetProps) => {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useRef(`mc-sheet-${Math.random().toString(36).slice(2, 9)}`).current;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // The content mounts with `open`; focus once it is there (showModal
      // alone would land on the ✕)
      if (initialFocus) requestAnimationFrame(() => initialFocus.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [initialFocus, open]);

  useEffect(() => {
    if (!open) return;
    document.documentElement.classList.add('mc-sheet-open');
    return () => document.documentElement.classList.remove('mc-sheet-open');
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`mc-sheet${className ? ` ${className}` : ''}`}
      style={width ? ({ '--mc-sheet-w': `${width}px` } as CSSProperties) : undefined}
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the dialog box itself (not its content) is the backdrop
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {open && (
        <>
          {!hideClose && (
            <button type="button" className="mc-rb mc-sheet-x" onClick={onClose} aria-label="Close">
              <X aria-hidden="true" />
            </button>
          )}
          <div className="mc-sheet-scroll">
            {title && (
              <h2 id={titleId} className={`mc-${titleSize} mc-sheet-title`}>
                {title}
              </h2>
            )}
            {children}
          </div>
          {footer && <div className="mc-sheet-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
};

export default Sheet;
