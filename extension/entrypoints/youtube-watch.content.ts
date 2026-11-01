// MAIN world: sees the page's own network calls. No browser.* APIs here.
import { defineContentScript } from 'wxt/utils/define-content-script';
import { watchSaves } from '@/utils/intercept';
import { YOUTUBE_MATCHES, youtubeWatcher } from '@/sources/youtube';

export default defineContentScript({
  matches: YOUTUBE_MATCHES,
  runAt: 'document_start',
  world: 'MAIN',
  main() {
    watchSaves(youtubeWatcher);
  },
});
