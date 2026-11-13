import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import {
  anchorIn,
  boxesInRange,
  layoutMasonry,
  masonryGeometry,
  type MasonryEntry,
  type MasonryGeometry,
  type MasonryResult,
} from '../../utils/masonry';

export type MasonryItem = MasonryEntry;

interface MasonryLayoutProps {
  items: readonly MasonryItem[];
  /** Renders one card. Called only for the cards near the viewport. */
  renderItem: (key: string) => ReactNode;
  /** A card's height before it has been measured (used until it mounts). */
  estimateHeight: (key: string, width: number) => number;
  /**
   * What a card's size depends on besides its width (its content version,
   * its picture's ratio). A remembered height counts only while this matches.
   */
  sizeToken?: (key: string) => string;
  /**
   * True while a card's final size isn't known yet (its picture hasn't
   * reported its size). The first screen waits briefly for these, so it
   * appears settled instead of shuffling.
   */
  isPending?: (key: string) => boolean;
  /** Lets estimates change (an image ratio learned off-screen) re-lay out the grid. */
  subscribeEstimates?: (onChange: () => void) => () => void;
  /** Cards near (but not yet in) the render window, for warming their pictures. */
  onPrefetch?: (keys: string[]) => void;
  /**
   * Identity of what the grid shows (filters, search, sort). Scroll position
   * is remembered per key; a new key starts at the top, or where it was
   * left when `restoreOnKeyChange` (Back/Forward).
   */
  scrollKey?: string;
  restoreOnKeyChange?: boolean;
  /** Columns are added while each can stay at least this wide. */
  minColumnWidth?: number;
  /** Changing this value animates every card to its new position (e.g. the expanded key). */
  animateKey?: string | null;
  className?: string;
}

const ANIMATION_WINDOW_MS = 900;
/** How long the first screen may wait for pictures to report their size. */
const SETTLE_TIMEOUT_MS = 450;
/** Render window around the viewport, in viewport heights, with pixel floors so a short phone screen still keeps a deep buffer for flicks. */
const OVERSCAN_BEHIND = 1;
const OVERSCAN_AHEAD = 1.5;
const MIN_BEHIND_PX = 800;
const MIN_AHEAD_PX = 1400;
/** Pictures further out than the window are warmed this far ahead. */
const PREFETCH_AHEAD = 4;

const parsePx = (value: string) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

/* Scroll positions per grid identity, for coming back from a note, another
   page, a reload, or Back/Forward. Session-scoped like browser history. */
const SCROLL_STORAGE_KEY = 'memex.gridScroll.v1';
let savedScroll: Map<string, number> | null = null;
let saveScrollTimer: ReturnType<typeof setTimeout> | null = null;
const scrollMemory = () => {
  if (savedScroll) return savedScroll;
  savedScroll = new Map();
  try {
    const raw = window.sessionStorage.getItem(SCROLL_STORAGE_KEY);
    if (raw) for (const [key, value] of Object.entries(JSON.parse(raw) as Record<string, number>)) savedScroll.set(key, value);
  } catch {
    /* storage unavailable: memory only */
  }
  return savedScroll;
};
const rememberScroll = (key: string, top: number) => {
  const memory = scrollMemory();
  memory.delete(key);
  memory.set(key, top);
  while (memory.size > 50) memory.delete(memory.keys().next().value as string);
  if (saveScrollTimer) return;
  saveScrollTimer = setTimeout(() => {
    saveScrollTimer = null;
    try {
      window.sessionStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(Object.fromEntries(scrollMemory())));
    } catch {
      /* quota or private mode: memory only */
    }
  }, 300);
};

/* Measured card heights, shared across mounts (back from a note, another
   page) and kept for the session, so a restored scroll position lands on
   real sizes instead of estimates. Each entry holds the width it was
   measured at and the card's size token. */
const HEIGHTS_STORAGE_KEY = 'memex.gridHeights.v1';
type MeasuredHeight = { height: number; width: number; token: string };
let heightCache: Map<string, MeasuredHeight> | null = null;
const measuredHeights = () => {
  if (heightCache) return heightCache;
  heightCache = new Map();
  try {
    const raw = window.sessionStorage.getItem(HEIGHTS_STORAGE_KEY);
    if (raw) {
      for (const [key, [height, width, token]] of Object.entries(JSON.parse(raw) as Record<string, [number, number, string]>)) {
        heightCache.set(key, { height, width, token });
      }
    }
  } catch {
    /* storage unavailable: memory only */
  }
  const persist = () => {
    try {
      const out: Record<string, [number, number, string]> = {};
      heightCache?.forEach((entry, key) => {
        out[key] = [Math.round(entry.height * 10) / 10, Math.round(entry.width * 10) / 10, entry.token];
      });
      window.sessionStorage.setItem(HEIGHTS_STORAGE_KEY, JSON.stringify(out));
    } catch {
      /* quota or private mode: memory only */
    }
  };
  window.addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist();
  });
  return heightCache;
};

const scrollParentOf = (el: HTMLElement | null): HTMLElement | null => {
  let node = el?.parentElement ?? null;
  while (node) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
    node = node.parentElement;
  }
  return null;
};

interface Viewport {
  /** Viewport top in the grid's own coordinates (negative while content above the grid shows). */
  top: number;
  height: number;
}

/**
 * Virtualized shortest-column masonry. Every card gets a position from its
 * measured (or estimated) height, but only the cards within a generous
 * window around the viewport are in the DOM, so a Library of thousands
 * scrolls like one of dozens. Cards are absolutely placed with transforms:
 * when one changes size, neighbours glide (around `animateKey` changes) or
 * settle in the same frame, and the first card on screen stays put
 * (scroll anchoring), so nothing visible jumps. Gaps come from the
 * container's CSS `column-gap` / `row-gap`, keeping spacing on theme tokens.
 */
const MasonryLayout = ({
  items,
  renderItem,
  estimateHeight,
  sizeToken,
  isPending,
  subscribeEstimates,
  onPrefetch,
  scrollKey = '',
  restoreOnKeyChange = false,
  minColumnWidth = 232,
  animateKey,
  className,
}: MasonryLayoutProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  const [gaps, setGaps] = useState({ column: 12, row: 12 });
  /** Bumped when a measured height or an estimate changes. */
  const [version, setVersion] = useState(0);
  const [viewport, setViewport] = useState<Viewport>({ top: 0, height: 0 });
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const [settled, setSettled] = useState(!isPending);

  // Latest callbacks without re-laying out when the parent re-renders
  const estimateRef = useRef(estimateHeight);
  estimateRef.current = estimateHeight;
  const tokenRef = useRef(sizeToken);
  tokenRef.current = sizeToken;
  const pendingRef = useRef(isPending);
  pendingRef.current = isPending;
  const scrollKeyRef = useRef(scrollKey);
  scrollKeyRef.current = scrollKey;

  /** Measured border-box heights (shared across mounts, see measuredHeights). */
  const heights = useRef(measuredHeights());
  /** Mounted cells by key. */
  const nodes = useRef(new Map<string, HTMLDivElement>());

  /* ---------- Container width + gaps ---------- */

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    scrollerRef.current = scrollParentOf(el);
    const read = () => {
      const style = getComputedStyle(el);
      setGaps((prev) => {
        const column = parsePx(style.columnGap);
        const row = parsePx(style.rowGap);
        return prev.column === column && prev.row === row ? prev : { column, row };
      });
      setWidth(el.clientWidth);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geometry = useMemo(
    () => masonryGeometry(width, minColumnWidth, gaps.column, gaps.row),
    [gaps.column, gaps.row, minColumnWidth, width],
  );

  /* ---------- Layout (every card, cheap: no DOM) ---------- */

  const layout: MasonryResult = useMemo(
    () =>
      geometry.columnWidth > 0
        ? layoutMasonry(items, geometry, (key, itemWidth) => {
            const measured = heights.current.get(key);
            // A mounted card's measurement is live (its observer keeps it
            // current); a remembered one counts while its token matches
            return measured &&
              Math.abs(measured.width - itemWidth) < 0.5 &&
              (nodes.current.has(key) || measured.token === (tokenRef.current?.(key) ?? ''))
              ? measured.height
              : estimateRef.current(key, itemWidth);
          })
        : { boxes: [], height: 0 },
    // version: measured heights / estimates changed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, geometry, version],
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  /* ---------- Viewport tracking ---------- */

  const readViewport = useCallback((): Viewport | null => {
    const el = containerRef.current;
    const scroller = scrollerRef.current;
    if (!el || !scroller) return null;
    const top = scroller.getBoundingClientRect().top - el.getBoundingClientRect().top;
    return { top, height: scroller.clientHeight };
  }, []);

  /** Which way the reader is scrolling: the bigger overscan goes that way. */
  const directionRef = useRef<1 | -1>(1);
  const commitViewport = useCallback((next: Viewport | null, force = false) => {
    if (!next) return;
    setViewport((prev) => {
      if (next.top !== prev.top) directionRef.current = next.top > prev.top ? 1 : -1;
      // Re-render only every quarter screen: the overscan covers the rest
      const step = Math.max(80, next.height / 4);
      if (!force && prev.height === next.height && Math.abs(prev.top - next.top) < step) return prev;
      return next;
    });
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onScroll = () => {
      commitViewport(readViewport());
      rememberScroll(scrollKeyRef.current, scroller.scrollTop);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => commitViewport(readViewport(), true));
    ro.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, [commitViewport, readViewport]);

  /* ---------- Scroll memory ---------- */

  const restoredRef = useRef(false);
  const lastKeyRef = useRef(scrollKey);
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || layout.boxes.length === 0 && items.length > 0) return;
    if (!restoredRef.current) {
      // First layout with real geometry: come back to where this grid was left
      restoredRef.current = true;
      lastKeyRef.current = scrollKey;
      const saved = scrollMemory().get(scrollKey);
      if (saved !== undefined) scroller.scrollTop = saved;
    } else if (lastKeyRef.current !== scrollKey) {
      // A new query starts at the top (Back/Forward returns where it was)
      lastKeyRef.current = scrollKey;
      const saved = restoreOnKeyChange ? scrollMemory().get(scrollKey) : undefined;
      scroller.scrollTop = saved ?? 0;
    } else {
      return;
    }
    commitViewport(readViewport(), true);
  }, [commitViewport, items.length, layout, readViewport, restoreOnKeyChange, scrollKey]);

  /* ---------- Scroll anchoring ---------- */

  // When heights change (pictures reporting their size, a card editing) the
  // first card on screen keeps its place. Changes below it move nothing; a
  // change above it would shove the screen, so the scroll offset absorbs it.
  const prevLayoutRef = useRef<{ layout: MasonryResult; items: readonly MasonryItem[]; geometry: MasonryGeometry } | null>(null);
  useLayoutEffect(() => {
    const prev = prevLayoutRef.current;
    prevLayoutRef.current = { layout, items, geometry };
    const scroller = scrollerRef.current;
    // Only height changes: a new item set or a resized grid lays out afresh
    if (!prev || !scroller || prev.items !== items || prev.geometry !== geometry) return;
    if (prev.layout.boxes.length !== layout.boxes.length) return;
    const vp = readViewport();
    if (!vp || vp.top <= 0) return;
    const visible = boxesInRange(prev.layout.boxes, vp.top, vp.top + vp.height);
    const anchor = anchorIn(prev.layout.boxes, visible, vp.top, vp.top + vp.height);
    if (!anchor) return;
    const index = prev.layout.boxes.indexOf(anchor);
    const delta = layout.boxes[index].y - anchor.y;
    if (Math.abs(delta) > 0.5) scroller.scrollTop += delta;
  }, [geometry, items, layout, readViewport]);

  /* ---------- Measuring mounted cards ---------- */

  const keyOfNode = useRef(new WeakMap<Element, string>());
  const cardObserver = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const key = keyOfNode.current.get(entry.target);
        if (!key) continue;
        const height = entry.borderBoxSize?.[0]?.blockSize ?? (entry.target as HTMLElement).offsetHeight;
        const cellWidth = entry.borderBoxSize?.[0]?.inlineSize ?? (entry.target as HTMLElement).offsetWidth;
        const token = tokenRef.current?.(key) ?? '';
        const previous = heights.current.get(key);
        if (
          previous &&
          previous.token === token &&
          Math.abs(previous.height - height) < 0.5 &&
          Math.abs(previous.width - cellWidth) < 0.5
        ) {
          continue;
        }
        heights.current.set(key, { height, width: cellWidth, token });
        changed = true;
      }
      // Re-place in this same frame, before paint, so a resized card never
      // overlaps its neighbours for a frame
      if (changed) flushSync(() => setVersion((v) => v + 1));
    });
    cardObserver.current = observer;
    return () => observer.disconnect();
  }, []);

  const refCallbacks = useRef(new Map<string, (node: HTMLDivElement | null) => void>());
  const setNodeRef = useCallback((key: string) => {
    let callback = refCallbacks.current.get(key);
    if (!callback) {
      callback = (node: HTMLDivElement | null) => {
        const previous = nodes.current.get(key);
        if (previous && previous !== node) cardObserver.current?.unobserve(previous);
        if (node) {
          nodes.current.set(key, node);
          keyOfNode.current.set(node, key);
          cardObserver.current?.observe(node);
        } else {
          nodes.current.delete(key);
          refCallbacks.current.delete(key);
        }
      };
      refCallbacks.current.set(key, callback);
    }
    return callback;
  }, []);

  // Estimates that change off-screen (a picture's size learned ahead of the
  // window) re-lay out once per frame at most
  useEffect(() => {
    if (!subscribeEstimates) return;
    let frame = 0;
    const unsubscribe = subscribeEstimates(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setVersion((v) => v + 1);
      });
    });
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
    };
  }, [subscribeEstimates]);

  /* ---------- Expand animation ---------- */

  // Animate positions only around deliberate changes, not image loads
  const firstAnimateKey = useRef(animateKey);
  useEffect(() => {
    if (firstAnimateKey.current === animateKey) return;
    firstAnimateKey.current = animateKey;
    setAnimating(true);
    const timer = window.setTimeout(() => setAnimating(false), ANIMATION_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [animateKey]);

  /* ---------- Render window ---------- */

  const screen = viewport.height || (typeof window !== 'undefined' ? window.innerHeight : 800);
  const goingUp = directionRef.current === -1;
  const ahead = Math.max(MIN_AHEAD_PX, screen * OVERSCAN_AHEAD);
  const behind = Math.max(MIN_BEHIND_PX, screen * OVERSCAN_BEHIND);
  const windowTop = viewport.top - (goingUp ? ahead : behind);
  const windowBottom = viewport.top + screen + (goingUp ? behind : ahead);
  const indices = useMemo(() => {
    const inRange = boxesInRange(layout.boxes, windowTop, windowBottom);
    // Keep the focused card in the DOM so keyboard focus survives scrolling
    if (focusKey) {
      const focusIndex = layout.boxes.findIndex((box) => box.key === focusKey);
      if (focusIndex !== -1 && !inRange.includes(focusIndex)) {
        inRange.push(focusIndex);
        inRange.sort((a, b) => a - b);
      }
    }
    return inRange;
  }, [focusKey, layout, windowBottom, windowTop]);

  // Warm pictures further out, both ways, so they know their size before arriving
  useEffect(() => {
    if (!onPrefetch || layout.boxes.length === 0) return;
    const far = screen * PREFETCH_AHEAD;
    const near = screen * PREFETCH_AHEAD * 0.5;
    const below = boxesInRange(layout.boxes, windowBottom, windowBottom + (goingUp ? near : far));
    const above = boxesInRange(layout.boxes, windowTop - (goingUp ? far : near), windowTop).reverse();
    // Nearest first, the way the reader is heading first
    const keys = (goingUp ? [...above, ...below] : [...below, ...above]).map((index) => layout.boxes[index].key);
    if (keys.length) onPrefetch(keys);
  }, [goingUp, layout, onPrefetch, screen, windowBottom, windowTop]);

  /* ---------- First screen settles before it shows ---------- */

  useEffect(() => {
    if (settled || layout.boxes.length === 0) return;
    const pending = pendingRef.current;
    const onScreen = boxesInRange(layout.boxes, Math.max(0, viewport.top), viewport.top + screen);
    if (!pending || !onScreen.some((index) => pending(layout.boxes[index].key))) setSettled(true);
  }, [layout, screen, settled, viewport.top]);

  useEffect(() => {
    if (settled) return;
    const timer = window.setTimeout(() => setSettled(true), SETTLE_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [settled]);

  /* ---------- Focus ---------- */

  const handleFocus = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('.memex-masonry-cell');
    const key = cell ? keyOfNode.current.get(cell) : undefined;
    if (key) setFocusKey(key);
  }, []);

  const handleBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusKey(null);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`memex-masonry${animating ? ' is-animating' : ''}${settled ? '' : ' is-settling'}${
        className ? ` ${className}` : ''
      }`}
      style={{ height: layout.height }}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {indices.map((index) => {
        const box = layout.boxes[index];
        return (
          <div
            key={box.key}
            ref={setNodeRef(box.key)}
            className={`memex-masonry-cell${box.span === 2 ? ' is-wide' : ''}`}
            style={{ width: box.width, transform: `translate3d(${box.x}px, ${box.y}px, 0)` }}
          >
            {renderItem(box.key)}
          </div>
        );
      })}
    </div>
  );
};

export default MasonryLayout;
