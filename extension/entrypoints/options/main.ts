import { browser } from 'wxt/browser';
import { testConnection } from '@/utils/api';
import { clearFailed, getQueueState } from '@/utils/queue';
import { getSettings, saveSettings, type Settings } from '@/utils/settings';
import type { ExtensionMessage } from '@/utils/types';

const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;

const status = (message: string, ok: boolean) => {
  const el = $('status');
  el.textContent = message;
  el.className = ok ? 'ok' : 'bad';
};

const SOURCE_LABEL: Record<string, string> = {
  extension: 'Saved from the toolbar',
  'x:bookmark': 'X bookmark',
  'pinterest:save': 'Pinterest save',
  x: 'X bookmark',
  pinterest: 'Pinterest save',
  youtube: 'YouTube like',
};
const sourceLabel = (source?: string) => (source ? (SOURCE_LABEL[source] ?? source) : SOURCE_LABEL.extension);

function readForm(current: Settings): Settings {
  return {
    ...current,
    apiUrl: $('apiUrl').value,
    token: $('token').value,
    appUrl: $('appUrl').value,
    sound: $('sound').checked,
    sites: { x: $('site-x').checked, pinterest: $('site-pinterest').checked, youtube: $('site-youtube').checked },
    savedBadge: $('savedBadge').checked,
  };
}

async function load(): Promise<void> {
  const s = await getSettings();
  $('apiUrl').value = s.apiUrl;
  $('token').value = s.token;
  $('appUrl').value = s.appUrl;
  $('sound').checked = s.sound;
  $('site-x').checked = s.sites.x;
  $('site-pinterest').checked = s.sites.pinterest;
  $('site-youtube').checked = s.sites.youtube;
  $('savedBadge').checked = s.savedBadge;
  await renderQueue();
}

function listItem(url: string, why: string): HTMLLIElement {
  const li = document.createElement('li');
  const u = document.createElement('span');
  u.className = 'url';
  u.textContent = url;
  u.title = url;
  const w = document.createElement('span');
  w.className = 'why';
  w.textContent = why;
  li.append(u, w);
  return li;
}

async function renderQueue(): Promise<void> {
  const { queue, failed } = await getQueueState();
  $('queue-section').hidden = queue.length === 0;
  $('queue').replaceChildren(
    ...queue.map((q) =>
      listItem(q.payload.url, `${sourceLabel(q.payload.source)} · ${q.lastError} · ${q.attempts} ${q.attempts === 1 ? 'try' : 'tries'}`),
    ),
  );
  $('failed-section').hidden = failed.length === 0;
  $('failed').replaceChildren(
    ...failed.map((f) => listItem(f.payload.url, `${sourceLabel(f.payload.source)} · ${f.error}`)),
  );
}

$<HTMLFormElement>('settings').onsubmit = async (event) => {
  event.preventDefault();
  await saveSettings(readForm(await getSettings()));
  await load();
  status('Saved ✓', true);
  // A fixed token should unstick anything waiting.
  void browser.runtime.sendMessage({ type: 'flush' } satisfies ExtensionMessage).then(renderQueue);
};

$('test').onclick = async () => {
  const s = readForm(await getSettings());
  const apiUrl = s.apiUrl.trim().replace(/\/+$/, '');
  const token = s.token.trim();
  if (!apiUrl || !token) {
    status('Fill in the API address and token first.', false);
    $(apiUrl ? 'token' : 'apiUrl').focus();
    return;
  }
  status('Testing…', true);
  try {
    status(`${await testConnection({ apiUrl, token })} ✓`, true);
  } catch (err) {
    status(err instanceof TypeError ? 'Could not reach that address.' : (err as Error).message, false);
  }
};

$('flush').onclick = async () => {
  $<HTMLButtonElement>('flush').disabled = true;
  await browser.runtime.sendMessage({ type: 'flush' } satisfies ExtensionMessage).catch(() => {});
  $<HTMLButtonElement>('flush').disabled = false;
  await renderQueue();
};

$('clear-failed').onclick = async () => {
  await clearFailed();
  await renderQueue();
};

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.queue || changes.failed) void renderQueue();
  // Switched from the popup or toolbar menu while this page is open.
  const sites = (changes.settings?.newValue as Settings | undefined)?.sites;
  if (sites) {
    $('site-x').checked = sites.x;
    $('site-pinterest').checked = sites.pinterest;
    $('site-youtube').checked = sites.youtube !== false;
  }
});

void load();
