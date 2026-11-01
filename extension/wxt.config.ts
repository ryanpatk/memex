import { defineConfig } from 'wxt';

// memex capture — MV3 extension. Build: `npm run build` → .output/chrome-mv3
// (load unpacked). Site access is limited to the sites we watch for saves;
// the toolbar and context menu work everywhere through activeTab. `tabs` lets
// the background read the current tab's URL for the “already in memex” ✓
// (Settings → “Mark pages already in memex” turns those lookups off).
export default defineConfig({
  manifest: {
    name: 'memex capture',
    description: 'Save the current page to memex in one click, and keep X bookmarks, Pinterest saves and YouTube likes in memex automatically.',
    permissions: ['activeTab', 'storage', 'alarms', 'contextMenus', 'tabs'],
    host_permissions: [
      'https://x.com/*',
      'https://twitter.com/*',
      'https://*.pinterest.com/*',
      'https://www.youtube.com/*',
      'https://m.youtube.com/*',
    ],
    icons: { 16: 'icons/16.png', 48: 'icons/48.png', 128: 'icons/128.png' },
    action: {
      default_title: 'Save to memex',
      default_icon: { 16: 'icons/16.png', 48: 'icons/48.png', 128: 'icons/128.png' },
    },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Ctrl+Shift+S', mac: 'Command+Shift+S' },
        description: 'Save the current page to memex',
      },
    },
  },
});
