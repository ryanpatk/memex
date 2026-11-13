import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { getImageRatio, prefetchImageRatios, setImageRatio, subscribeImageRatios } from '../utils/imageRatios';

/** Frames to keep checking a picture for its size before giving up (≈10s at 60fps). */
const MAX_POLL_FRAMES = 600;

/**
 * A preview image's remembered aspect ratio (height / width), and a ref for
 * the <img> that reports it: as soon as the picture's header arrives
 * (`naturalWidth` is known well before the bytes finish), not at `load`.
 */
export const useImageRatio = (url: string) => {
  const ratio = useSyncExternalStore(
    subscribeImageRatios,
    () => getImageRatio(url),
    () => undefined,
  );
  const frame = useRef(0);

  const stop = () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
  };

  const imageRef = useCallback(
    (node: HTMLImageElement | null) => {
      const wasWatching = frame.current !== 0;
      stop();
      // Scrolled away before the picture reported its size: keep learning it
      // in the background, so it is right when the reader comes back
      if (!node && wasWatching && url && getImageRatio(url) === undefined) prefetchImageRatios([url]);
      if (!node || !url || getImageRatio(url) !== undefined) return;
      let frames = 0;
      const check = () => {
        frame.current = 0;
        if (node.naturalWidth > 0 && node.naturalHeight > 0) {
          setImageRatio(url, node.naturalWidth, node.naturalHeight);
          return;
        }
        if (frames++ < MAX_POLL_FRAMES && !(node.complete && node.naturalWidth === 0 && frames > 2)) {
          frame.current = requestAnimationFrame(check);
        }
      };
      check();
    },
    [url],
  );

  useEffect(() => stop, []);

  return { ratio, imageRef };
};
