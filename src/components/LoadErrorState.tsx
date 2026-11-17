import { useState } from 'react';
import { useOnline } from '../hooks/useOnline';
import { loadErrorCopy } from '../utils/loadState';
import { EmptySlot } from './cards/Controls';

interface LoadErrorStateProps {
  /** What didn't load, as it reads after “Couldn’t load”: “your Journal”, “your tasks”. */
  what: string;
  /** Refetch whatever failed. */
  onRetry: () => Promise<unknown> | void;
}

/**
 * A page's reads failed (or are paused offline) with nothing cached to show:
 * say so, with Retry, instead of an empty state that reads like a new
 * account. Pages decide when with utils/loadState's `loadStateOf`.
 */
const LoadErrorState = ({ what, onRetry }: LoadErrorStateProps) => {
  const online = useOnline();
  const [retrying, setRetrying] = useState(false);
  const { title, subtitle } = loadErrorCopy(what, online);

  const retry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } catch {
      // The query's own state shows the outcome
    } finally {
      setRetrying(false);
    }
  };

  // d40: a red slot (orange while offline) with Retry
  return (
    <EmptySlot
      color={online ? 'var(--mc-err)' : 'var(--mc-orange)'}
      glyph={<span aria-hidden="true">!</span>}
      title={title}
      body={subtitle}
      action={
        <button type="button" className="mc-btn is-primary" onClick={() => void retry()} disabled={retrying} aria-busy={retrying || undefined}>
          Retry
        </button>
      }
    />
  );
};

export default LoadErrorState;
