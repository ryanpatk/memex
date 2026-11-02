import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { lastLabel } from '../spaces/SpaceCard';
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

describe('lastLabel', () => {
  it('says today with the time, yesterday, or the date', () => {
    expect(lastLabel(new Date(2026, 10, 1, 9, 5).toISOString(), NOW)).toMatch(/^today 9:05/);
    expect(lastLabel(new Date(2026, 9, 31, 23, 0).toISOString(), NOW)).toBe('yesterday');
    expect(lastLabel(new Date(2026, 9, 28, 8, 0).toISOString(), NOW)).toMatch(/Oct 28/);
  });
});

describe('Spaces tab', () => {
  it('lists every space with its counts and newest entries, and Tasks on top', async () => {
    await renderWithData(<SpacesScreen />);
    await flush();
    expect(screen.getByText('4 spaces')).toBeTruthy();
    expect(screen.getByLabelText(/^Studio, 7 items · 2 open tasks · last today/)).toBeTruthy();
    expect(screen.getByLabelText(/^Reading, 3 items · last /)).toBeTruthy();
    expect(screen.getByLabelText('Task: Write the case study intro')).toBeTruthy();
    expect(screen.getByLabelText('Task: Order film for the trip')).toBeTruthy();
    expect(screen.getByLabelText('Tasks, 6 open · 1 overdue · 1 due today')).toBeTruthy();
  });

  it('opens a space’s board and Tasks', async () => {
    await renderWithData(<SpacesScreen />);
    await flush();
    await fireEvent.press(screen.getByTestId('space-card-kyoto'));
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
    expect(screen.getByText('4 entries')).toBeTruthy();
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
    expect(screen.getByText('[test] tea at Ippodo')).toBeTruthy();

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
