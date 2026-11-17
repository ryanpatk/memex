import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Share } from 'react-native';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { renderWithData } from '../testing/render';
import LibraryScreen from '../app/(tabs)/library';
import LinkDetailScreen from '../app/link/[id]';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const routerMock = require('expo-router') as { __router: { push: jest.Mock; back: jest.Mock }; __setParams: (p: object) => void };

const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  routerMock.__router.push.mockClear();
  routerMock.__router.back.mockClear();
});

describe('Cards', () => {
  it('shows saved links newest first, each labelled with its space', async () => {
    await renderWithData(<LibraryScreen />);
    await flush();
    expect(screen.getByRole('header', { name: 'Cards, 24' })).toBeTruthy();
    expect(screen.getByLabelText('Notes on a personal library, for the reading pile, Unfiled, are.na')).toBeTruthy();
    expect(screen.getByLabelText(/^Calm Technology, Reading, /)).toBeTruthy();
  });

  it('opens a card', async () => {
    await renderWithData(<LibraryScreen />);
    await flush();
    await fireEvent.press(screen.getByTestId('library-card-y1'));
    expect(routerMock.__router.push).toHaveBeenCalledWith({ pathname: '/link/[id]', params: { id: 'y1' } });
  });
});

describe('Link detail', () => {
  it('shows the link and opens it in the in-app browser', async () => {
    routerMock.__setParams({ id: 'l2' });
    await renderWithData(<LinkDetailScreen />);
    await flush();
    expect(screen.getByRole('header', { name: 'Calm Technology' })).toBeTruthy();
    expect(screen.getByText('Principles for technology that respects attention.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Open in Safari' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://calmtech.com/', expect.anything());
  });

  it('files and unfiles the link from its pills: “+ Space” and a filed pill open File in (m04)', async () => {
    routerMock.__setParams({ id: 'l2' });
    const { repository } = await renderWithData(<LinkDetailScreen />);
    await flush();
    const inSpace = async (space: string) => (await repository.spaceLinks.listMembership()).some((r) => r.link_id === 'l2' && r.profile_id === space);
    expect(screen.getByRole('button', { name: 'In Reading. Change spaces' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Add to a space' }));
    expect(within(screen.getByTestId('menu')).getByRole('menuitem', { name: 'Reading' }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(within(screen.getByTestId('menu')).getByRole('menuitem', { name: 'Kyoto trip' }));
    await flush();
    expect(await inSpace('kyoto')).toBe(true);
    expect(screen.getByRole('button', { name: 'In Kyoto trip. Change spaces' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'In Reading. Change spaces' }));
    await fireEvent.press(within(screen.getByTestId('menu')).getByRole('menuitem', { name: 'Reading' }));
    await flush();
    expect(await inSpace('reading')).toBe(false);
  });

  it('shares the link', async () => {
    routerMock.__setParams({ id: 'l2' });
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    await renderWithData(<LinkDetailScreen />);
    await flush();
    await fireEvent.press(screen.getByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledWith({ url: 'https://calmtech.com/', message: 'https://calmtech.com/' });
    share.mockRestore();
  });

  it('deletes with Undo and goes back', async () => {
    routerMock.__setParams({ id: 'l2' });
    const { repository } = await renderWithData(<LinkDetailScreen />);
    await flush();
    await fireEvent.press(screen.getByRole('button', { name: 'More actions' }));
    await fireEvent.press(within(screen.getByTestId('menu')).getByRole('menuitem', { name: 'Delete' }));
    expect(routerMock.__router.back).toHaveBeenCalled();
    expect(screen.getByText('Deleted “Calm Technology”.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    await flush();
    expect(await repository.links.getById('l2')).not.toBeNull();
  });

  it('says so when the link is gone', async () => {
    routerMock.__setParams({ id: 'nope' });
    await renderWithData(<LinkDetailScreen />);
    await flush();
    expect(screen.getByText('This link isn’t here anymore')).toBeTruthy();
  });
});
