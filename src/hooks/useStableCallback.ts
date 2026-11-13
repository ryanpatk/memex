import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A function whose identity never changes but always calls the latest
 * `callback`. For handlers passed to memoized cards, so a page re-render
 * doesn't re-render every card on screen.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any callable
export const useStableCallback = <T extends (...args: any[]) => any>(callback: T): T => {
  const ref = useRef(callback);
  useLayoutEffect(() => {
    ref.current = callback;
  });
  return useCallback(((...args: Parameters<T>) => ref.current(...args)) as T, []);
};
