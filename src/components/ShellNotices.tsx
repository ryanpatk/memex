import { useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { useFeedbackToast } from '../hooks/useFeedbackToast';
import { useOnline } from '../hooks/useOnline';
import { notices } from '../utils/notices';
import { FeedbackToast } from './ui';

/**
 * What the signed-in shell says on every page: the fallback toast for writes
 * that failed without their own message (Providers' MutationCache →
 * `notices`), and a small, non-blocking line while the browser is offline.
 * Lives in MemexShell, so it outlasts page changes (an Undo window that
 * commits on leaving can still report).
 */
const ShellNotices = () => {
  const online = useOnline();
  const { toast, flash, handleAnimationEnd } = useFeedbackToast();

  useEffect(() => notices.subscribe((message) => flash(message)), [flash]);

  return (
    <>
      {/* The live region stays mounted so the line is announced when it appears */}
      <div className="memex-offline-region" role="status" aria-live="polite">
        {!online && (
          <p className="memex-offline-notice">
            <WifiOff aria-hidden="true" />
            Offline. Changes won’t save until you’re back online.
          </p>
        )}
      </div>
      {toast !== null && (
        <FeedbackToast message={toast.message} phase={toast.phase} action={toast.action} onAnimationEnd={handleAnimationEnd} />
      )}
    </>
  );
};

export default ShellNotices;
