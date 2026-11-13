import { useCallback, useEffect, useRef, useState } from 'react';
import { getShownRatio, setShownRatio } from '../utils/imageRatios';

/* One IntersectionObserver for every picture card. */
const callbacks = new WeakMap<Element, (entry: IntersectionObserverEntry) => void>();
let observer: IntersectionObserver | null = null;
const shared = () =>
  (observer ??= new IntersectionObserver((entries) => {
    for (const entry of entries) callbacks.get(entry.target)?.(entry);
  }));

/**
 * The aspect ratio a picture card shows. It starts at what the card showed
 * last (or `target`), and moves to a newly learned `target` only while the
 * card is below the viewport: a card on screen or above it never resizes
 * (masonry would carry the change into the cards on screen); its picture
 * crops to the box (`object-fit: cover`) until then. While the grid's
 * first screen is still settling (hidden, see MasonryLayout) anything goes.
 */
export const useShownRatio = (url: string, target: number) => {
  const [shown, setShown] = useState(() => getShownRatio(url) ?? target);
  const below = useRef(false);
  const node = useRef<Element | null>(null);
  const free = () => below.current || Boolean(node.current?.closest('.is-settling'));
  const latest = useRef(target);
  latest.current = target;

  const adopt = useCallback(
    (ratio: number) => {
      setShownRatio(url, ratio);
      setShown(ratio);
    },
    [url],
  );

  useEffect(() => {
    if (getShownRatio(url) === undefined) setShownRatio(url, shown);
    // record once per mount; later changes go through adopt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    if (target !== shown && free()) adopt(target);
    // free() reads refs: the IntersectionObserver re-checks when they change
  }, [adopt, shown, target]);

  const ref = useCallback(
    (element: Element | null) => {
      node.current = element;
      if (!element) return;
      const io = shared();
      callbacks.set(element, (entry) => {
        const bottom = entry.rootBounds?.bottom ?? window.innerHeight;
        below.current = !entry.isIntersecting && entry.boundingClientRect.top >= bottom;
        if (free()) adopt(latest.current);
      });
      io.observe(element);
      return () => {
        io.unobserve(element);
        callbacks.delete(element);
        node.current = null;
      };
    },
    [adopt],
  );

  return [shown, ref] as const;
};
