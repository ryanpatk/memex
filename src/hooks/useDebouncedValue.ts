import { useEffect, useState } from 'react';

/** `value`, once it has held still for `delay` ms. An empty string applies at once (clearing feels instant). */
export const useDebouncedValue = <T,>(value: T, delay: number): T => {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (value === '' || Object.is(value, settled)) {
      setSettled(value);
      return;
    }
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
    // settled is only compared, not a trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay, value]);
  return settled;
};
