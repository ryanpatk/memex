// Save-on-open popup: opening it (click or ⌘⇧S) captures the active tab.
import { browser } from 'wxt/browser';
import { getSettings, linkInAppUrl, setSiteEnabled } from '@/utils/settings';
import { playBlip } from '@/utils/sound';
import type { CaptureResult, ExtensionMessage, Space, WatchedSite } from '@/utils/types';

type State = 'setup' | 'saving' | 'saved' | 'duplicate' | 'queued' | 'error';

const show = (name: State) => {
  for (const el of document.querySelectorAll<HTMLElement>('.state')) {
    el.hidden = el.id !== `state-${name}`;
  }
  return document.getElementById(`state-${name}`)!;
};
const field = (state: HTMLElement, name: string) =>
  state.querySelector<HTMLElement>(`[data-field="${name}"]`)!;

const send = <T>(message: ExtensionMessage) => browser.runtime.sendMessage(message) as Promise<T>;

for (const el of document.querySelectorAll<HTMLElement>('.open-options')) {
  el.onclick = () => void browser.runtime.openOptionsPage();
}

async function capture(): Promise<void> {
  const settings = await getSettings();
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ?? '';
  if (!/^https?:\/\//.test(url)) {
    field(show('error'), 'message').textContent = 'This page can’t be saved (only http/https).';
    return;
  }

  field(show('saving'), 'url').textContent = url;
  let result: CaptureResult;
  try {
    result = await send<CaptureResult>({
      type: 'capture',
      payload: { url, title: tab?.title || undefined, favicon: tab?.favIconUrl },
    });
  } catch (err) {
    result = { status: 'error', message: String(err) };
  }

  const state = show(result.status);
  if (result.status === 'saved' || result.status === 'duplicate') {
    field(state, 'title').textContent = result.link.title || result.link.url;
    for (const a of state.querySelectorAll<HTMLAnchorElement>('.open-app')) {
      a.href = linkInAppUrl(settings, result.link.id);
    }
  }
  if (result.status === 'saved') {
    if (settings.sound) playBlip();
    wireUndo(result.link.id, url);
  }
  if (result.status === 'saved' || result.status === 'duplicate') void offerFiling(result.link.id);
  if (result.status === 'queued' || result.status === 'error') {
    field(state, 'message').textContent = result.message;
  }
}

function wireUndo(linkId: string, url: string): void {
  const undo = document.getElementById('undo') as HTMLButtonElement;
  undo.onclick = async () => {
    undo.disabled = true;
    const ok = await send<boolean>({ type: 'undo', linkId }).catch(() => false);
    if (!ok) {
      undo.disabled = false;
      undo.textContent = 'Undo failed — retry';
      return;
    }
    document.getElementById('filing')!.hidden = true;
    const state = show('error');
    const headline = field(state, 'headline');
    headline.textContent = 'removed';
    headline.classList.remove('error');
    field(state, 'message').textContent = url;
    document.getElementById('retry')!.textContent = 'Save again';
  };
}

/** After a save: an optional space picker. Ignoring it leaves the link in Home. */
async function offerFiling(linkId: string): Promise<void> {
  const section = document.getElementById('filing')!;
  const select = document.getElementById('space') as HTMLSelectElement;
  const status = document.getElementById('filing-status')!;
  const spaces = await send<Space[] | null>({ type: 'spaces' }).catch(() => null);
  if (!spaces?.length) return;

  select.replaceChildren(
    new Option('Choose a space…', ''),
    ...spaces.map((space) => new Option(space.name, space.id)),
  );
  section.hidden = false;
  const added: string[] = [];
  select.onchange = async () => {
    const spaceId = select.value;
    const name = select.selectedOptions[0]?.textContent ?? 'space';
    if (!spaceId) return;
    select.disabled = true;
    status.textContent = `Adding to ${name}…`;
    const ok = await send<boolean>({ type: 'file', linkId, spaceId }).catch(() => false);
    select.disabled = false;
    select.value = '';
    if (ok && !added.includes(name)) added.push(name);
    status.textContent = ok ? `Added to ${added.join(', ')} ✓` : `Couldn’t add to ${name}. Try again.`;
  };
}

async function wireSiteSwitches(): Promise<void> {
  const { sites } = await getSettings();
  for (const site of Object.keys(sites) as WatchedSite[]) {
    const input = document.getElementById(`site-${site}`) as HTMLInputElement;
    input.checked = sites[site];
    // Takes effect immediately: open tabs read the setting on every save.
    input.onchange = () => void setSiteEnabled(site, input.checked);
  }
}

document.getElementById('retry')!.onclick = () => void capture();

void wireSiteSwitches();

void capture();
