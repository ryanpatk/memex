// YouTube: liking a video (the 👍 on a watch page, a Short, or the mini player).
// Dislikes and "remove like" are different endpoints and are ignored.
// Matching adapted from pond's YouTube source
// (github.com/raphaelsalaja/pond, apps/extension/sources/youtube, MIT © 2026 Raphael Salaja).
import type { SaveWatcher } from '@/utils/intercept';
import { SITE_ID_PATTERN, type CapturePayload } from '@/utils/types';

export const YOUTUBE_MATCHES = ['https://www.youtube.com/*', 'https://m.youtube.com/*'];

const LIKE_RE = /\/youtubei\/v1\/like\/like(?:$|[?/])/i;

export const youtubeWatcher: SaveWatcher = {
  site: 'youtube',
  match: (url, method) => method === 'POST' && LIKE_RE.test(url),
  idFromBody(body) {
    try {
      const json = JSON.parse(body) as { target?: { videoId?: unknown }; videoId?: unknown };
      const id = String(json?.target?.videoId ?? json?.videoId ?? '');
      return SITE_ID_PATTERN.youtube.test(id) ? id : null;
    } catch {
      return null;
    }
  },
};

/** 754 → "12:34", 4000 → "1:06:40". */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/**
 * The liked video. When it's the one on screen, read its title, channel and
 * length from the page (description becomes "Channel · 12:34"); otherwise the
 * scraper fills in from YouTube's own metadata. The thumbnail always exists.
 */
export function youtubePayload(id: string): CapturePayload {
  const payload: CapturePayload = {
    url: `https://www.youtube.com/watch?v=${id}`,
    source: 'youtube',
    sourceId: id,
    list: 'liked',
    image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
  const onScreen = new URLSearchParams(location.search).get('v') === id || location.pathname === `/shorts/${id}`;
  if (!onScreen) return payload;

  const isShort = location.pathname.startsWith('/shorts/');
  const heading = isShort
    ? document.querySelector('ytd-reel-video-renderer[is-active] h2, ytd-reel-video-renderer[is-active] .title')
    : document.querySelector('ytd-watch-metadata h1, h1.ytd-watch-metadata');
  const title =
    heading?.textContent?.trim() ||
    document.title.replace(/^\(\d+\)\s*/, '').replace(/\s*-\s*YouTube$/, '').trim() ||
    undefined;
  const channel = document
    .querySelector(isShort ? 'ytd-reel-video-renderer[is-active] ytd-channel-name a' : 'ytd-watch-metadata ytd-channel-name a, #owner ytd-channel-name a')
    ?.textContent?.trim();
  const video = document.querySelector<HTMLVideoElement>('#movie_player video, video.html5-main-video');
  const length = video && Number.isFinite(video.duration) && video.duration > 0 ? formatDuration(video.duration) : null;

  return {
    ...payload,
    title,
    description: [channel, length].filter(Boolean).join(' · ') || undefined,
  };
}
