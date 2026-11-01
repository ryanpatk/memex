import { describe, expect, it } from 'vitest';
import { pinterestWatcher } from './pinterest';
import { xWatcher } from './x';
import { formatDuration, youtubeWatcher } from './youtube';

describe('youtubeWatcher', () => {
  it('matches likes only', () => {
    expect(youtubeWatcher.match('https://www.youtube.com/youtubei/v1/like/like?prettyPrint=false', 'POST')).toBe(true);
    expect(youtubeWatcher.match('https://www.youtube.com/youtubei/v1/like/dislike', 'POST')).toBe(false);
    expect(youtubeWatcher.match('https://www.youtube.com/youtubei/v1/like/removelike', 'POST')).toBe(false);
    expect(youtubeWatcher.match('https://www.youtube.com/youtubei/v1/like/like', 'GET')).toBe(false);
  });

  it('reads the video id from the request body', () => {
    expect(youtubeWatcher.idFromBody(JSON.stringify({ context: {}, target: { videoId: 'dQw4w9WgXcQ' } }))).toBe('dQw4w9WgXcQ');
    expect(youtubeWatcher.idFromBody(JSON.stringify({ target: { videoId: 'not-a-video-id' } }))).toBeNull();
    expect(youtubeWatcher.idFromBody('garbage')).toBeNull();
  });

  it('formats durations', () => {
    expect(formatDuration(754)).toBe('12:34');
    expect(formatDuration(4000)).toBe('1:06:40');
    expect(formatDuration(5)).toBe('0:05');
  });
});

describe('xWatcher and pinterestWatcher', () => {
  it('still match bookmarks and saves', () => {
    expect(xWatcher.match('https://x.com/i/api/graphql/abc123/CreateBookmark', 'POST')).toBe(true);
    expect(xWatcher.match('https://x.com/i/api/graphql/abc123/FavoriteTweet', 'POST')).toBe(false);
    expect(xWatcher.idFromBody(JSON.stringify({ variables: { tweet_id: '1850000000000000001' } }))).toBe('1850000000000000001');
    expect(pinterestWatcher.match('https://www.pinterest.com/resource/RepinResource/create/', 'POST')).toBe(true);
    expect(pinterestWatcher.idFromBody(`data=${encodeURIComponent(JSON.stringify({ options: { pin_id: '123' } }))}`)).toBe('123');
  });
});
