import { defineContentScript } from 'wxt/utils/define-content-script';
import { bridgeSaves } from '@/utils/bridge';
import { YOUTUBE_MATCHES, youtubePayload } from '@/sources/youtube';

export default defineContentScript({
  matches: YOUTUBE_MATCHES,
  runAt: 'document_start',
  main() {
    bridgeSaves('youtube', youtubePayload);
  },
});
