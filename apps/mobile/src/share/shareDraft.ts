import type { SharePayload } from '@memex/core';

/*
 * What's waiting in the share sheet. It outlives the sheet's screen, so a
 * share made while signed out is still there after you've signed in (the
 * root layout reopens the sheet). Memory only: a share you never saved
 * isn't kept across launches.
 */

let current: SharePayload | null = null;
const listeners = new Set<() => void>();

const same = (a: SharePayload | null, b: SharePayload | null) =>
  a === b || (a !== null && b !== null && a.url === b.url && a.text === b.text && a.title === b.title);

export const shareDraft = {
  get: () => current,
  set(next: SharePayload | null) {
    if (same(current, next)) return;
    current = next;
    listeners.forEach((listener) => listener());
  },
  clear() {
    shareDraft.set(null);
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
