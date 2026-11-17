import type { AnimationEvent } from 'react';
import { Check } from 'lucide-react';
import { useCardsLook } from '../../look/look';

export type FeedbackToastPhase = 'entering' | 'exiting';

interface FeedbackToastProps {
  message: string;
  phase: FeedbackToastPhase;
  onAnimationEnd?: (event: AnimationEvent<HTMLDivElement>) => void;
  /** Optional inline action, e.g. Undo after a delete. */
  action?: { label: string; onClick: () => void };
}

/**
 * Bottom-right feedback toast. Presentational only — the caller owns timing
 * and phase transitions (see useFeedbackToast). In the Memory Cards look it
 * is the kit's pill toast, bottom-centre (s08).
 */
const FeedbackToast = ({ message, phase, onAnimationEnd, action }: FeedbackToastProps) => {
  const cards = useCardsLook();
  if (cards) {
    return (
      <div className="mc-toast-host">
        <div className={`mc-toast is-${phase}`} role="status" aria-live="polite" onAnimationEnd={onAnimationEnd}>
          <span className="mc-toast-mark" aria-hidden="true">
            <Check />
          </span>
          <span>{message}</span>
          {action && (
            <button type="button" onClick={action.onClick}>
              {action.label}
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div
      className={`bookmark-bulk-feedback is-${phase}${action ? ' has-action' : ''}`}
      role="status"
      aria-live="polite"
      onAnimationEnd={onAnimationEnd}
    >
      <span className="bookmark-bulk-feedback-mark" aria-hidden="true">
        OK
      </span>
      <span className="bookmark-bulk-feedback-text">{message}</span>
      {action && (
        <button type="button" className="bookmark-bulk-feedback-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
};

export default FeedbackToast;
