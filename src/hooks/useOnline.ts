import { useSyncExternalStore } from 'react';

const subscribe = (onChange: () => void) => {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
};

/**
 * Whether the browser says it's online (`navigator.onLine`, live). False
 * means certainly offline; true can still mean a network that doesn't reach
 * memex, so treat it as a hint for copy, not a guarantee.
 */
export const useOnline = () =>
  useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
