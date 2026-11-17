import { useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import Menu from './Menu';
import Sheet from './Sheet';

/* Pieces the Agent tokens and Access tokens sheets share (d32, d45). */

/** A copyable value in a sunken well: the MCP URL, or a token shown once. */
export const CopyRow = ({ value, label, copyLabel = 'Copy' }: { value: string; label: string; copyLabel?: string }) => {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  return (
    <div className="mc-copyrow">
      <code translate="no" aria-label={label}>
        {value}
      </code>
      <button
        type="button"
        className="mc-btn is-small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setState('copied');
          } catch {
            setState('failed');
          }
        }}
      >
        {state === 'copied' ? 'Copied ✓' : copyLabel}
      </button>
      <span className="mc-sr-only" aria-live="polite">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed; select the text and copy it yourself.' : ''}
      </span>
    </div>
  );
};

interface TokenRowProps {
  name: string;
  meta: string;
  /** Dimmed (revoked or expired). */
  inactive?: boolean;
  onRevoke?: () => void;
}

/** One token: its name, what it can do and when it was used, and a ••• with Revoke. */
export const TokenRow = ({ name, meta, inactive = false, onRevoke }: TokenRowProps) => (
  <li className={`mc-token-row${inactive ? ' is-inactive' : ''}`}>
    <div>
      <p className="mc-token-name" translate="no">
        {name}
      </p>
      <p className="mc-lab">{meta}</p>
    </div>
    {onRevoke && (
      <Menu
        label={`Token ${name}`}
        entries={[{ id: 'revoke', label: 'Revoke…', danger: true, onSelect: onRevoke }]}
        trigger={(props) => (
          <button {...props} type="button" className="mc-rb is-small" aria-label={`More for ${name}`}>
            <MoreHorizontal aria-hidden="true" />
          </button>
        )}
      />
    )}
  </li>
);

interface ConfirmSheetProps {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** The confirm sheet (s07): one danger action, Cancel beside it. */
export const ConfirmSheet = ({ open, title, body, confirmLabel, busy = false, onConfirm, onClose }: ConfirmSheetProps) => (
  <Sheet titleSize="h2"
    open={open}
    onClose={onClose}
    title={title}
    width={600}
    footer={
      <div className="mc-sheet-foot-actions">
        <button type="button" className="mc-btn is-quiet" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="mc-btn is-danger" aria-busy={busy || undefined} disabled={busy} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    }
  >
    <p className="mc-body mc-sheet-lede">{body}</p>
  </Sheet>
);
