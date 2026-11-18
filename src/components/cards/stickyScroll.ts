import { useEffect, useState, type RefObject } from 'react';

/** Whether `ref`'s element has scrolled up out of the shell's scroll area. */
export const useScrolledPast = (ref: RefObject<HTMLElement | null>) => {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = el.closest<HTMLElement>('.mc-shell-main');
    const observer = new IntersectionObserver(
      ([entry]) => {
        const top = entry.rootBounds?.top ?? 0;
        setPast(!entry.isIntersecting && entry.boundingClientRect.bottom <= top + 1);
      },
      { root, threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return past;
};

/** Back to the top of the shell's scroll area: a jump from far away, a short glide from near, none with reduced motion. */
export const scrollShellToTop = (from: Element | null) => {
  const scroller = (from?.closest('.mc-shell-main') ?? document.querySelector('.mc-shell-main')) as HTMLElement | null;
  if (!scroller) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const far = scroller.scrollTop > scroller.clientHeight * 3;
  scroller.scrollTo({ top: 0, behavior: reduce || far ? 'auto' : 'smooth' });
  // Keyboard and screen reader users land on the page's heading
  scroller.querySelector<HTMLElement>('.mc-page h1')?.focus({ preventScroll: true });
};
