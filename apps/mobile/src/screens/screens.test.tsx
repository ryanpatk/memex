import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
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

describe('Library', () => {
  it('shows saved links newest first, with source counts', async () => {
    await renderWithData(<LibraryScreen />);
    await flush();
    expect(screen.getByText('24 links')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pinterest, 10' })).toBeTruthy();
    expect(screen.getByLabelText('Notes on a personal library, for the reading pile, are.na')).toBeTruthy();
  });

  it('filters by source and by search, and says how many match', async () => {
    await renderWithData(<LibraryScreen />);
    await flush();
    await fireEvent.press(screen.getByRole('button', { name: 'YouTube, 4' }));
    expect(screen.getByText('4 of 24 links')).toBeTruthy();
    expect(screen.queryByLabelText(/are\.na$/)).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search the Library'), 'kintsugi');
    expect(screen.getByText('1 of 24 links')).toBeTruthy();
    expect(screen.getByLabelText('Kintsugi: mending with gold, YouTube')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search the Library'), 'zzz');
    expect(screen.getByText('Nothing matches “zzz”')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Show everything' }));
    expect(screen.getByText('24 links')).toBeTruthy();
  });

  it('opens link detail from a card', async () => {
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

  it('files and unfiles the link in a space', async () => {
    routerMock.__setParams({ id: 'l2' });
    const { repository } = await renderWithData(<LinkDetailScreen />);
    await flush();
    const inSpace = async (space: string) => (await repository.spaceLinks.listMembership()).some((r) => r.link_id === 'l2' && r.profile_id === space);
    expect(screen.getByRole('checkbox', { name: 'Reading' }).props.accessibilityState.checked).toBe(true);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Kyoto trip' }));
    await flush();
    expect(screen.getByRole('checkbox', { name: 'Kyoto trip' }).props.accessibilityState.checked).toBe(true);
    expect(await inSpace('kyoto')).toBe(true);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Reading' }));
    await flush();
    expect(await inSpace('reading')).toBe(false);
  });

  it('deletes with Undo and goes back', async () => {
    routerMock.__setParams({ id: 'l2' });
    const { repository } = await renderWithData(<LinkDetailScreen />);
    await flush();
    await fireEvent.press(screen.getByRole('button', { name: 'Delete link' }));
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
