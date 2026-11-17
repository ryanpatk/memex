import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Text } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { MC_COLORS_LIGHT } from '@memex/core';
import { CaptureHost } from '../cards/CaptureSheet';
import { captureStore } from '../cards/capture';
import { AccountButton } from '../ui/AccountButton';
import { NOW, renderWithData } from '../testing/render';
import { ThemeProvider, themeFor, useTheme } from '../theme/theme';
import JournalScreen from '../app/(tabs)/index';
import LibraryScreen from '../app/(tabs)/library';
import SpacesScreen from '../app/(tabs)/spaces';

/*
 * Memory Cards, the phone's one look: the theme, the tab heroes (m01, m02),
 * Cards' long-press menu (m08) and search (m09), and Save something (m05).
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const routerMock = require('expo-router') as { __router: { push: jest.Mock; replace: jest.Mock } };

const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) {
      jest.advanceTimersByTime(1);
      await new Promise((resolve) => setImmediate(resolve));
    }
  });

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  routerMock.__router.push.mockClear();
});
afterEach(async () => {
  // Let each screen's queries settle before the next test renders
  await flush();
  jest.useRealTimers();
});

const Probe = () => {
  const t = useTheme();
  return <Text testID="probe">{`${t.palette.canvas}|${t.cards.colors.paper}`}</Text>;
};

describe('the theme', () => {
  it('is Memory Cards, in light and dark', async () => {
    await renderWithData(<Probe />);
    expect(screen.getByTestId('probe').props.children).toBe(`${MC_COLORS_LIGHT.bg}|${MC_COLORS_LIGHT.paper}`);
    expect(themeFor(true).cards.colors.paper).toBe('#1f242c');
    expect(themeFor(false).palette.ink).toBe(MC_COLORS_LIGHT.ink);
  });

  it('drops the old look choice from storage once, and shrugs off storage that fails', async () => {
    const removeItem = jest.fn((_key: string) => Promise.resolve());
    await render(
      <ThemeProvider legacyStorage={{ removeItem }}>
        <Probe />
      </ThemeProvider>,
    );
    expect(removeItem).toHaveBeenCalledWith('memex.look');
    await render(
      <ThemeProvider legacyStorage={{ removeItem: () => Promise.reject(new Error('locked')) }}>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('probe')).toBeTruthy();
  });
});

describe('the tabs', () => {
  it('Journal: the hero reads Today with today’s count; Tasks lives on the Spaces tab', async () => {
    await renderWithData(<JournalScreen />);
    await flush();
    expect(screen.getAllByLabelText(/^Today, \d+$/).length).toBe(1);
    expect(screen.queryByRole('button', { name: /^Tasks/ })).toBeNull();
  });

  it('Spaces: a Tasks tile on top, then a tile per space that opens its board', async () => {
    await renderWithData(<SpacesScreen />);
    await flush();
    const tasks = screen.getAllByRole('link').find((el) => /^Tasks, \d+ open/.test(el.props.accessibilityLabel ?? ''))!;
    await fireEvent.press(tasks);
    expect(routerMock.__router.push).toHaveBeenCalledWith('/tasks');
    const tiles = screen.getAllByRole('link').filter((el) => / cards/.test(el.props.accessibilityLabel ?? ''));
    expect(tiles.length).toBe(4);
    await fireEvent.press(screen.getByLabelText(/^Kyoto trip, \d+ cards/));
    expect(routerMock.__router.push).toHaveBeenLastCalledWith({ pathname: '/space/[id]', params: { id: 'kyoto' } });
  });
});

describe('Cards', () => {
  it('the hero carries the count, cards carry their space label, pills filter', async () => {
    await renderWithData(<LibraryScreen />);
    await flush();
    expect(screen.getByRole('header', { name: 'Cards, 24' })).toBeTruthy();
    expect(screen.getByLabelText('Notes on a personal library, for the reading pile, Unfiled, are.na')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'Studio' }));
    await flush();
    expect(screen.getByRole('header', { name: /^Studio, \d+$/ })).toBeTruthy();
    expect(screen.queryByLabelText(/are\.na$/)).toBeNull();
    await fireEvent.press(screen.getByRole('tab', { name: 'All' }));
    expect(screen.getByRole('header', { name: 'Cards, 24' })).toBeTruthy();
  });

  it('opens a card; long-press files it from the menu, with Undo (m08)', async () => {
    const { repository } = await renderWithData(<LibraryScreen />);
    await flush();
    await fireEvent.press(screen.getByTestId('library-card-y1'));
    expect(routerMock.__router.push).toHaveBeenCalledWith({ pathname: '/link/[id]', params: { id: 'y1' } });
    await fireEvent(screen.getByTestId('library-card-y1'), 'longPress');
    const menu = within(screen.getByTestId('menu'));
    expect(menu.getByText('File in')).toBeTruthy();
    expect(menu.getByRole('menuitem', { name: 'Home' }).props.accessibilityState.checked).toBe(true);
    expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeTruthy();
    await fireEvent.press(menu.getByRole('menuitem', { name: 'Kyoto trip' }));
    await flush();
    expect(screen.queryByTestId('menu')).toBeNull();
    const inKyoto = async () => (await repository.spaceLinks.listMembership()).some((r) => r.link_id === 'y1' && r.profile_id === 'kyoto');
    expect(await inKyoto()).toBe(true);
    const toast = within(screen.getByTestId('toast'));
    expect(toast.getByText('Filed in “Kyoto trip”.')).toBeTruthy();
    await fireEvent.press(toast.getByRole('button', { name: 'Undo' }));
    await flush();
    expect(await inKyoto()).toBe(false);
  });

  it('search swaps the pills for the field, says how many match, and saves the words as a jot (m09, m05)', async () => {
    const { repository } = await renderWithData(
      <>
        <LibraryScreen />
        <CaptureHost />
      </>,
    );
    await flush();
    await fireEvent.press(screen.getByRole('button', { name: 'Search cards' }));
    expect(screen.queryByRole('tab', { name: 'All' })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Search cards'), 'kintsugi');
    await flush();
    expect(screen.getByText('1 card')).toBeTruthy();
    expect(screen.getByLabelText('Kintsugi: mending with gold, Unfiled, YouTube')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search cards'), '[test] kintsugi bowls');
    await flush();
    expect(screen.getByText('Nothing matches “[test] kintsugi bowls”')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Save “[test] kintsugi bowls” as a jot' }));
    const sheet = within(screen.getByTestId('capture-sheet'));
    expect(sheet.getByLabelText('Text to save').props.value).toBe('[test] kintsugi bowls');
    await fireEvent.press(sheet.getByRole('button', { name: 'Save jot' }));
    await flush();
    expect((await repository.jots.getAll()).some((j) => j.body === '[test] kintsugi bowls')).toBe(true);
    expect(screen.queryByTestId('capture-sheet')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Close search' }));
    expect(screen.getByRole('tab', { name: 'All' })).toBeTruthy();
  });
});

describe('Save something (m05)', () => {
  it('saves a task in the spaces you pick; a jot keeps to one space', async () => {
    const { repository } = await renderWithData(<CaptureHost />);
    await flush();
    await act(async () => captureStore.open());
    const sheet = () => within(screen.getByTestId('capture-sheet'));
    expect(sheet().getByRole('tab', { name: 'Jot' }).props.accessibilityState.selected).toBe(true);
    // A jot lives in one space: picking a second moves it.
    await fireEvent.press(sheet().getByRole('button', { name: 'File in Kyoto trip' }));
    await fireEvent.press(sheet().getByRole('button', { name: 'File in Studio' }));
    expect(sheet().getByRole('button', { name: 'File in Kyoto trip' }).props.accessibilityState.selected).toBe(false);
    // A task can go in several.
    await fireEvent.press(sheet().getByRole('tab', { name: 'Task' }));
    await fireEvent.press(sheet().getByRole('button', { name: 'File in Kyoto trip' }));
    await fireEvent.changeText(sheet().getByLabelText('Text to save'), '[test] order tile samples');
    await fireEvent.press(sheet().getByRole('button', { name: 'Save task' }));
    await flush();
    const task = (await repository.tasks.getAll()).find((t) => t.title === '[test] order tile samples')!;
    expect(task).toBeTruthy();
    const filed = (await repository.spaceTasks.listMembership()).filter((r) => r.task_id === task.id).map((r) => r.profile_id).sort();
    expect(filed).toEqual(['kyoto', 'studio']);
    expect(screen.queryByTestId('capture-sheet')).toBeNull();
  });

  it('Save waits for text, and the scrim closes the sheet without saving', async () => {
    const { repository } = await renderWithData(<CaptureHost />);
    await flush();
    const before = (await repository.jots.getAll()).length;
    await act(async () => captureStore.open());
    expect(screen.getByRole('button', { name: 'Save' }).props.accessibilityState.disabled).toBe(true);
    // The scrim (VoiceOver closes it with the escape gesture instead)
    await fireEvent.press(screen.getByLabelText('Close', { includeHiddenElements: true }));
    expect(screen.queryByTestId('capture-sheet')).toBeNull();
    expect(await repository.jots.getAll()).toHaveLength(before);
  });
});

describe('The account sheet (m07)', () => {
  it('opens from the account button: Dark follows the system, then Sign out; no look switch', async () => {
    await renderWithData(<AccountButton />);
    await fireEvent.press(screen.getByRole('button', { name: /^Account/ }));
    expect(screen.getByRole('header', { name: 'Account' })).toBeTruthy();
    expect(screen.getByLabelText('Dark mode off, follows the system')).toBeTruthy();
    expect(screen.queryByText('New look')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
  });
});
