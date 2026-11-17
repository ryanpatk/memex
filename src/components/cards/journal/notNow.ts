import { useCallback, useSyncExternalStore } from 'react';
import { hideFromInbox } from './entryLabel';

/*
 * Inbox suggestions put away with “Not now” (Memory Cards Inbox page). Kept
 * for this browser session only: the save stays unfiled, and the suggestion
 * comes back next session if it still applies. Shared so the top bar's Inbox
 * count can leave them out too.
 */

const KEY = 'memex.inbox.not-now';
const EVENT = 'memex:inbox-not-now';
let snapshot: { raw: string; set: ReadonlySet<string> } = { raw: '[]', set: new Set() };

const read = (): ReadonlySet<string> => {
  let raw = '[]';
  try {
    raw = window.sessionStorage.getItem(KEY) ?? '[]';
  } catch {
    /* storage unavailable */
  }
  if (raw !== snapshot.raw) {
    try {
      snapshot = { raw, set: new Set(JSON.parse(raw) as string[]) };
    } catch {
      snapshot = { raw, set: new Set() };
    }
  }
  return snapshot.set;
};

const write = (next: ReadonlySet<string>) => {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify([...next]));
  } catch {
    snapshot = { raw: JSON.stringify([...next]), set: next };
  }
  window.dispatchEvent(new Event(EVENT));
};

const subscribe = (onChange: () => void) => {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
};

const EMPTY: ReadonlySet<string> = new Set();

/** Entry ids put away this session, plus put-away / bring-back. */
export const useNotNow = () => {
  const notNow = useSyncExternalStore(subscribe, read, () => EMPTY);
  const putAway = useCallback((id: string) => write(hideFromInbox(read(), id)), []);
  const bringBack = useCallback((id: string) => {
    const next = new Set(read());
    next.delete(id);
    write(next);
  }, []);
  return { notNow, putAway, bringBack };
};
