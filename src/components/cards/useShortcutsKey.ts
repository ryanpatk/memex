import { useEffect } from 'react';

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return Boolean(el?.closest('input, textarea, select, [contenteditable="true"], .cm-editor'));
};

/** `?` anywhere (outside a text field) opens the Keys sheet. */
export const useShortcutsKey = (onOpen: () => void) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target) || document.querySelector('dialog[open]')) return;
      event.preventDefault();
      onOpen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpen]);
};
