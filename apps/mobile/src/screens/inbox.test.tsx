import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { createFixtureRepository } from '../data/fixtures/fixtureRepository';
import { NOW, renderWithData } from '../testing/render';
import InboxScreen from '../app/(tabs)/inbox';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const routerMock = require('expo-router') as { __router: { push: jest.Mock } };

/** Repository promises and React Query's batched updates, with the fake clock ticking. */
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) {
      jest.advanceTimersByTime(1);
      await new Promise((resolve) => setImmediate(resolve));
    }
  });

const mount = async () => {
  const utils = await renderWithData(<InboxScreen />);
  await flush();
  return utils;
};

const inSpace = async (repository: ReturnType<typeof createFixtureRepository>, linkId: string, space: string) =>
  (await repository.spaceLinks.listMembership()).some((r) => r.link_id === linkId && r.profile_id === space);

// The Inbox holds the last 30 days of the demo data, which is dated around NOW.
beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  routerMock.__router.push.mockClear();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('Inbox', () => {
  it('shows agents’ proposals, then filing suggestions, with the count', async () => {
    await mount();
    expect(screen.getByText('9 waiting')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'From agents' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Filing suggestions' })).toBeTruthy();
    const filing = within(screen.getByTestId('proposal-pr1'));
    expect(filing.getByText('File this link in')).toBeTruthy();
    expect(filing.getByText('Progressive disclosure, revisited')).toBeTruthy();
    const append = within(screen.getByTestId('proposal-pr2'));
    expect(append.getByLabelText('Added: ## Day 3')).toBeTruthy();
    const edit = within(screen.getByTestId('proposal-pr3'));
    expect(edit.getByLabelText(/^Title: Sketch the share sheet flow becomes /)).toBeTruthy();
    expect(within(screen.getByTestId('suggestion-link:l3')).getByLabelText('Likely Reading: Mentions “Reading”')).toBeTruthy();
  });

  it('approves a proposal through core: the link is filed and the card goes', async () => {
    const { repository } = await mount();
    await fireEvent.press(within(screen.getByTestId('proposal-pr1')).getByRole('button', { name: 'Approve' }));
    await flush();
    expect(await inSpace(repository, 'o5', 'studio')).toBe(true);
    expect(screen.queryByTestId('proposal-pr1')).toBeNull();
    expect(screen.getByText('Approved Grok Bot’s change.')).toBeTruthy();
    expect(screen.getByText('8 waiting')).toBeTruthy();
  });

  it('rejects a proposal without changing the item', async () => {
    const { repository } = await mount();
    await fireEvent.press(within(screen.getByTestId('proposal-pr3')).getByRole('button', { name: 'Reject' }));
    await flush();
    expect(screen.queryByTestId('proposal-pr3')).toBeNull();
    expect((await repository.proposals.getPending()).map((p) => p.id)).toEqual(['pr1', 'pr2']);
    expect((await repository.tasks.getAll()).find((t) => t.id === 't2')?.title).toBe('Sketch the share sheet flow');
  });

  it('files a suggestion, with Undo', async () => {
    const { repository } = await mount();
    await fireEvent.press(within(screen.getByTestId('suggestion-link:l3')).getByRole('button', { name: 'File in Reading' }));
    await flush();
    expect(await inSpace(repository, 'l3', 'reading')).toBe(true);
    expect(screen.queryByTestId('suggestion-link:l3')).toBeNull();
    expect(screen.getByText('Filed in “Reading”.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    await flush();
    expect(await inSpace(repository, 'l3', 'reading')).toBe(false);
    expect(screen.getByTestId('suggestion-link:l3')).toBeTruthy();
  });

  it('leaves a suggestion unfiled with Not now, with Undo', async () => {
    const { repository } = await mount();
    await fireEvent.press(within(screen.getByTestId('suggestion-link:l3')).getByRole('button', { name: 'Not now' }));
    await flush();
    expect(screen.queryByTestId('suggestion-link:l3')).toBeNull();
    expect(screen.getByText('8 waiting')).toBeTruthy();
    expect(await inSpace(repository, 'l3', 'reading')).toBe(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    await flush();
    expect(screen.getByTestId('suggestion-link:l3')).toBeTruthy();
  });

  it('opens a suggested link', async () => {
    await mount();
    await fireEvent.press(within(screen.getByTestId('suggestion-link:l3')).getByRole('link'));
    expect(routerMock.__router.push).toHaveBeenCalledWith({ pathname: '/link/[id]', params: { id: 'l3' } });
  });

  it('says nothing is waiting when it’s empty', async () => {
    const base = createFixtureRepository({ now: NOW });
    const quiet = { ...base, proposals: { ...base.proposals, getPending: async () => [] } };
    await renderWithData(<InboxScreen />, quiet);
    await flush();
    // Six filing suggestions, each left unfiled.
    for (let i = 0; i < 6; i += 1) {
      await fireEvent.press(screen.getAllByRole('button', { name: 'Not now' })[0]);
      await flush();
    }
    expect(screen.getByText('Nothing waiting')).toBeTruthy();
    expect(screen.getByText('All caught up')).toBeTruthy();
  });
});
