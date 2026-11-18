import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { NOW, renderWithData } from '../testing/render';
import SpacesScreen from '../app/(tabs)/spaces';
import SpaceScreen from '../app/space/[id]';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const routerMock = require('expo-router') as { __router: { push: jest.Mock; replace: jest.Mock }; __setParams: (p: object) => void };

/** Repository promises and React Query's batched updates, with the fake clock ticking. */
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) {
      jest.advanceTimersByTime(1);
      await new Promise((resolve) => setImmediate(resolve));
    }
  });

// The demo data is dated around NOW; “today” has to mean the same day here.
beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  routerMock.__router.push.mockClear();
  routerMock.__router.replace.mockClear();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('Spaces tab', () => {
  it('shows a Tasks tile with the open count, then a colour tile per space with its count', async () => {
    await renderWithData(<SpacesScreen />);
    await flush();
    expect(screen.getByRole('header', { name: 'Spaces' })).toBeTruthy();
    expect(screen.getByLabelText('Tasks, 6 open, 1 overdue')).toBeTruthy();
    expect(screen.getByLabelText('Studio, 7 cards, 2 open tasks')).toBeTruthy();
    expect(screen.getByLabelText('Reading, 3 cards')).toBeTruthy();
  });

  it('shows the global pinned sites on top, in their order, and opens them', async () => {
    await renderWithData(<SpacesScreen />);
    await flush();
    expect(screen.getByRole('header', { name: 'Pinned' })).toBeTruthy();
    const pins = screen.getAllByLabelText(/^Pinned: /).map((el) => el.props.accessibilityLabel);
    expect(pins).toEqual(['Pinned: Calm Technology', 'Pinned: Notes on a personal library, for the reading pile', 'Pinned: The Shape of Design']);
    await fireEvent.press(screen.getByLabelText('Pinned: Calm Technology'));
    expect(routerMock.__router.push).toHaveBeenCalledWith({ pathname: '/link/[id]', params: { id: 'l2' } });
  });

  it('long-press moves a pin earlier, and unpins with Undo', async () => {
    const { repository } = await renderWithData(<SpacesScreen />);
    await flush();
    await fireEvent(screen.getByLabelText('Pinned: The Shape of Design'), 'longPress');
    let menu = within(screen.getByTestId('menu'));
    expect(menu.queryByRole('menuitem', { name: 'Move later' })).toBeNull();
    await fireEvent.press(menu.getByRole('menuitem', { name: 'Move earlier' }));
    await flush();
    const order = () => screen.getAllByLabelText(/^Pinned: /).map((el) => el.props.accessibilityLabel.replace('Pinned: ', ''));
    expect(order()).toEqual(['Calm Technology', 'The Shape of Design', 'Notes on a personal library, for the reading pile']);
    const stored = async () =>
      Object.fromEntries((await repository.links.getAll()).filter((l) => l.is_super_favorite).map((l) => [l.id, l.pin_position]));
    expect(await stored()).toEqual({ l2: 1, l1: 2, l3: 3 });

    await fireEvent(screen.getByLabelText('Pinned: Calm Technology'), 'longPress');
    menu = within(screen.getByTestId('menu'));
    await fireEvent.press(menu.getByRole('menuitem', { name: 'Unpin' }));
    await flush();
    expect(order()).toEqual(['The Shape of Design', 'Notes on a personal library, for the reading pile']);
    const toast = within(screen.getByTestId('toast'));
    expect(toast.getByText('Unpinned Calm Technology.')).toBeTruthy();
    await fireEvent.press(toast.getByRole('button', { name: 'Undo' }));
    await flush();
    expect(order()).toEqual(['Calm Technology', 'The Shape of Design', 'Notes on a personal library, for the reading pile']);
  });

  it('long-press moves a space earlier, in the Spaces tab and in the Cards pills', async () => {
    const { repository } = await renderWithData(<SpacesScreen />);
    await flush();
    const tiles = () =>
      screen
        .getAllByRole('link')
        .map((el) => el.props.accessibilityLabel as string)
        .filter((label) => / cards/.test(label) && !label.startsWith('Tasks'))
        .map((label) => label.split(',')[0]);
    expect(tiles()).toEqual(['Studio', 'Kyoto trip', 'Reading', 'Home']);
    await fireEvent(screen.getByLabelText(/^Reading, /), 'longPress');
    const menu = within(screen.getByTestId('menu'));
    await fireEvent.press(menu.getByRole('menuitem', { name: 'Move earlier' }));
    await flush();
    expect(tiles()).toEqual(['Studio', 'Reading', 'Kyoto trip', 'Home']);
    const stored = (await repository.spaces.getAll()).map((s) => s.name);
    expect(stored).toEqual(['Studio', 'Reading', 'Kyoto trip', 'Home']);
  });

  it('long-press hides a space from the Cards row; its tile says so', async () => {
    const { repository } = await renderWithData(<SpacesScreen />);
    await flush();
    await fireEvent(screen.getByLabelText(/^Kyoto trip, /), 'longPress');
    await fireEvent.press(within(screen.getByTestId('menu')).getByRole('menuitem', { name: 'Hide from the Cards row' }));
    await flush();
    expect(screen.getByLabelText(/^Kyoto trip, .*hidden from the Cards row$/)).toBeTruthy();
    expect(screen.getByText('Hidden from Cards')).toBeTruthy();
    expect((await repository.spaces.getAll()).find((s) => s.id === 'kyoto')?.hidden).toBe(true);
  });

  it('opens a space’s board and Tasks', async () => {
    await renderWithData(<SpacesScreen />);
    await flush();
    await fireEvent.press(screen.getByLabelText(/^Kyoto trip, /));
    expect(routerMock.__router.push).toHaveBeenCalledWith({ pathname: '/space/[id]', params: { id: 'kyoto' } });
    await fireEvent.press(screen.getByLabelText(/^Tasks, /));
    expect(routerMock.__router.push).toHaveBeenCalledWith('/tasks');
  });
});

describe('A space’s board', () => {
  it('shows only that space’s entries, newest at the bottom', async () => {
    routerMock.__setParams({ id: 'kyoto' });
    await renderWithData(<SpaceScreen />);
    await flush();
    expect(screen.getByRole('header', { name: 'Kyoto trip' })).toBeTruthy();
    expect(screen.getByText('4 cards · 2 tasks')).toBeTruthy();
    expect(screen.getByLabelText('Task: Renew passport photos')).toBeTruthy();
    expect(screen.getByLabelText('Note: Kyoto — first draft itinerary')).toBeTruthy();
    expect(screen.queryByLabelText(/Calm Technology/)).toBeNull();
    expect(screen.getByLabelText('Tasks, 2 open')).toBeTruthy();
  });

  it('files what you write there, unless it names another space', async () => {
    routerMock.__setParams({ id: 'kyoto' });
    const { repository } = await renderWithData(<SpaceScreen />);
    await flush();
    const field = screen.getByLabelText('Write in Kyoto trip');
    await fireEvent.changeText(field, '[test] tea at Ippodo');
    await fireEvent.press(screen.getByTestId('composer-send'));
    await flush();
    expect((await repository.jots.getAll()).at(-1)).toMatchObject({ body: '[test] tea at Ippodo', profile_id: 'kyoto' });
    expect(screen.getByLabelText(/^Jot at .*: \[test\] tea at Ippodo/)).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Write in Kyoto trip'), '[] [test] pack the tripod @Studio');
    await fireEvent.press(screen.getByTestId('composer-send'));
    await flush();
    const task = (await repository.tasks.getAll()).find((t) => t.title === '[test] pack the tripod')!;
    expect((await repository.spaceTasks.listMembership()).filter((r) => r.task_id === task.id).map((r) => r.profile_id)).toEqual(['studio']);
  });

  it('shows the space’s pinned sites (core’s spaceBoard) and opens them', async () => {
    routerMock.__setParams({ id: 'reading' });
    await renderWithData(<SpaceScreen />);
    await flush();
    const pins = screen.getAllByLabelText(/^Pinned: /).map((el) => el.props.accessibilityLabel);
    expect(pins).toEqual(['Pinned: Calm Technology', 'Pinned: The Shape of Design']);
    await fireEvent.press(screen.getByLabelText('Pinned: Calm Technology'));
    expect(routerMock.__router.push).toHaveBeenCalledWith({ pathname: '/link/[id]', params: { id: 'l2' } });
  });

  it('long-press moves a space pin within that space only', async () => {
    routerMock.__setParams({ id: 'reading' });
    const { repository } = await renderWithData(<SpaceScreen />);
    await flush();
    await fireEvent(screen.getByLabelText('Pinned: The Shape of Design'), 'longPress');
    await fireEvent.press(within(screen.getByTestId('menu')).getByRole('menuitem', { name: 'Move earlier' }));
    await flush();
    const pins = screen.getAllByLabelText(/^Pinned: /).map((el) => el.props.accessibilityLabel);
    expect(pins).toEqual(['Pinned: The Shape of Design', 'Pinned: Calm Technology']);
    const rows = (await repository.spaceLinks.listMembership()).filter((r) => r.profile_id === 'reading' && r.is_super_favorite);
    expect(Object.fromEntries(rows.map((r) => [r.link_id, r.pin_position]))).toEqual({ l1: 1, l2: 2 });
    // The global pins keep their own order
    expect((await repository.links.getAll()).find((l) => l.id === 'l1')?.pin_position).toBeUndefined();
  });

  it('opens Tasks filtered to the space', async () => {
    routerMock.__setParams({ id: 'kyoto' });
    await renderWithData(<SpaceScreen />);
    await flush();
    await fireEvent.press(screen.getByTestId('tasks-button'));
    expect(routerMock.__router.push).toHaveBeenCalledWith({ pathname: '/tasks', params: { space: 'kyoto' } });
  });

  it('says so when the space is gone', async () => {
    routerMock.__setParams({ id: 'nope' });
    await renderWithData(<SpaceScreen />);
    await flush();
    expect(screen.getByText('This space isn’t here anymore')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'All spaces' }));
    expect(routerMock.__router.replace).toHaveBeenCalledWith('/spaces');
  });
});
