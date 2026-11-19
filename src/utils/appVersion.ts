/*
 * Is a newer memex deployed than the one this tab is running? memex has no
 * service worker and the page's HTML is revalidated on every load, but a tab
 * that stays open keeps running the JavaScript it loaded: moving between
 * pages never fetches new code. A tab opened before a deploy can lack a
 * feature that's live for everyone else (the drop tray, 2026-11-19), and
 * can't load the new build's lazy chunks. ShellNotices asks for the page's
 * HTML now and then and offers a Reload when its main bundle changed.
 */

/** The main bundle a page's HTML loads (`/assets/index-<hash>.js`), or null. */
export const mainBundleOf = (html: string): string | null => {
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    if (!/\btype=["']module["']/i.test(tag)) continue;
    const src = /\bsrc=["']([^"']+)["']/i.exec(tag)?.[1];
    if (src) return src;
  }
  return null;
};

/** True when the deployed HTML loads a different main bundle than the running one. */
export const isNewerDeploy = (deployedHtml: string, runningBundle: string | null): boolean => {
  const deployed = mainBundleOf(deployedHtml);
  return Boolean(deployed && runningBundle && deployed !== runningBundle);
};
