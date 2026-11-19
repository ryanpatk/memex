import { useEffect, useState } from 'react';
import { isNewerDeploy } from '../utils/appVersion';

const CHECK_EVERY_MS = 15 * 60 * 1000;

/**
 * Whether memex has been deployed since this tab loaded (utils/appVersion.ts):
 * the page's HTML is fetched (never from cache) when the tab comes back into
 * view, when the window is focused, and every 15 minutes, and its main
 * bundle compared with the one running. Nothing is reloaded for you; the
 * shell offers a Reload, so a half-written jot is never lost.
 */
export function useNewerDeploy() {
  const [newer, setNewer] = useState(false);

  useEffect(() => {
    if (newer) return;
    const running = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src') ?? null;
    let lastCheck = 0;
    const check = async () => {
      if (!navigator.onLine || document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastCheck < 30_000) return;
      lastCheck = now;
      try {
        const response = await fetch('/', { cache: 'no-store', credentials: 'same-origin' });
        if (!response.ok) return;
        if (isNewerDeploy(await response.text(), running)) setNewer(true);
      } catch {
        /* offline or blocked: try again later */
      }
    };
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    const onVisible = () => void check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [newer]);

  return newer;
}
