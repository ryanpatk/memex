import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { ActionSheetIOS } from 'react-native';
import { NOW, renderWithData } from '../testing/render';
import TasksScreen from '../app/tasks';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const routerMock = require('expo-router') as { __router: { setParams: jest.Mock }; __setParams: (p: object) => void };

/** Repository promises and React Query's batched updates, with the fake clock ticking. */
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) {
      jest.advanceTimersByTime(1);
      await new Promise((resolve) => setImmediate(resolve));
    }
  });

const mount = async (params: object = {}) => {
  routerMock.__setParams(params);
  const utils = await renderWithData(<TasksScreen />);
  await flush();
  return utils;
};

/** Answer the next action sheet with the option labelled `label`. */
const choose = (label: string) =>
  jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions').mockImplementationOnce((options, callback) => callback(options.options.indexOf(label)));

const row = (id: string) => within(screen.getByTestId(`task-row-${id}`));
const task = async (repository: Awaited<ReturnType<typeof mount>>['repository'], id: string) => (await repository.tasks.getAll()).find((t) => t.id === id);

describe('Tasks', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    routerMock.__router.setParams.mockClear();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('groups open tasks by space, then by due date', async () => {
    await mount();
    expect(screen.getByText('6 open · 1 overdue · 1 due today')).toBeTruthy();
    for (const name of ['Studio, 2', 'Kyoto trip, 2', 'Home, 1', 'Unfiled, 1']) expect(screen.getByRole('header', { name })).toBeTruthy();
    expect(row('t2').getByRole('button', { name: 'Due Tomorrow. Change due date' })).toBeTruthy();
    expect(row('t5').getByRole('button', { name: /^Due .*, overdue\. Change due date$/ })).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: 'By due date' }));
    for (const name of ['Overdue, 1', 'Today, 1', 'Tomorrow, 1', 'Next 7 days, 1', 'Later, 1', 'No due date, 1']) expect(screen.getByRole('header', { name })).toBeTruthy();
    expect(routerMock.__router.setParams).toHaveBeenLastCalledWith({ group: 'date', space: undefined, done: undefined });
  });

  it('filters to one space, and new tasks go there', async () => {
    const { repository } = await mount({ space: 'kyoto' });
    expect(screen.getByRole('button', { name: 'Kyoto trip, 2' }).props.accessibilityState.selected).toBe(true);
    expect(screen.queryByRole('header', { name: 'Studio, 2' })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Add a task'), '[test] order film');
    await fireEvent.press(screen.getByRole('button', { name: 'Add task' }));
    await flush();
    const added = (await repository.tasks.getAll()).find((t) => t.title === '[test] order film')!;
    expect((await repository.spaceTasks.listMembership()).filter((r) => r.task_id === added.id).map((r) => r.profile_id)).toEqual(['kyoto']);
    await fireEvent.press(screen.getByRole('button', { name: 'Every space, 7' }));
    expect(screen.getByRole('header', { name: 'Studio, 2' })).toBeTruthy();
  });

  it('adds with @Space from the add field', async () => {
    const { repository } = await mount();
    await fireEvent.changeText(screen.getByLabelText('Add a task'), '[test] buy tape @Home');
    await fireEvent(screen.getByLabelText('Add a task'), 'submitEditing');
    await flush();
    const added = (await repository.tasks.getAll()).find((t) => t.title === '[test] buy tape')!;
    expect((await repository.spaceTasks.listMembership()).filter((r) => r.task_id === added.id).map((r) => r.profile_id)).toEqual(['home']);
  });

  it('ticks a task: it holds a beat in its group, moves to Done, and Undo brings it back', async () => {
    const { repository } = await mount();
    await fireEvent.press(row('t3').getByRole('checkbox'));
    await flush();
    expect(row('t3').getByRole('checkbox').props.accessibilityState.checked).toBe(true);
    expect(screen.getByRole('header', { name: 'Kyoto trip, 2' })).toBeTruthy();
    expect((await task(repository, 't3'))?.is_done).toBe(true);
    expect(screen.getByText('Done: Renew passport photos')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('header', { name: 'Kyoto trip, 1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Done, 3' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
    await flush();
    expect((await task(repository, 't3'))?.is_done).toBe(false);
    expect(screen.getByRole('header', { name: 'Kyoto trip, 2' })).toBeTruthy();
  });

  it('opens Done and reopens a task from it', async () => {
    const { repository } = await mount();
    expect(screen.queryByTestId('task-row-t1')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Done, 2' }));
    expect(routerMock.__router.setParams).toHaveBeenLastCalledWith({ group: undefined, space: undefined, done: '1' });
    await fireEvent.press(row('t1').getByRole('checkbox'));
    await flush();
    expect((await task(repository, 't1'))?.is_done).toBe(false);
    expect(screen.getByText('Reopened “Book the ryokan in Arashiyama”.')).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Kyoto trip, 3' })).toBeTruthy();
  });

  it('sets a due date from the chip’s menu, and clears it', async () => {
    const { repository } = await mount();
    choose('Tomorrow');
    await fireEvent.press(row('t3').getByRole('button', { name: 'Set a due date' }));
    await flush();
    expect((await task(repository, 't3'))?.due_date).toBe('2026-11-02');
    expect(row('t3').getByRole('button', { name: 'Due Tomorrow. Change due date' })).toBeTruthy();
    expect(screen.getByText('Due tomorrow.')).toBeTruthy();
    choose('No due date');
    await fireEvent.press(row('t3').getByRole('button', { name: 'Due Tomorrow. Change due date' }));
    await flush();
    expect((await task(repository, 't3'))?.due_date).toBeUndefined();
  });

  it('picks any date from the calendar sheet', async () => {
    const { repository } = await mount();
    choose('Pick a date…');
    await fireEvent.press(row('t6').getByRole('button', { name: 'Due Today. Change due date' }));
    await fireEvent(screen.getByTestId('due-date-picker'), 'valueChange', new Date(2026, 10, 20));
    await fireEvent.press(screen.getByRole('button', { name: 'Set due date' }));
    await flush();
    expect((await task(repository, 't6'))?.due_date).toBe('2026-11-20');
    expect(screen.queryByTestId('due-date-picker')).toBeNull();
  });

  it('offers the menu as VoiceOver actions: due date, spaces, delete', async () => {
    const { repository } = await mount();
    const title = screen.getByLabelText('Task: Renew passport photos');
    expect(title.props.accessibilityActions.map((a: { name: string }) => a.name)).toEqual(['toggle', 'due', 'rename', 'spaces', 'delete']);
    choose('Studio');
    await fireEvent(title, 'accessibilityAction', { nativeEvent: { actionName: 'spaces' } });
    await flush();
    expect((await repository.spaceTasks.listMembership()).filter((r) => r.task_id === 't3').map((r) => r.profile_id).sort()).toEqual(['kyoto', 'studio']);
    await fireEvent(screen.getByLabelText('Task: Renew passport photos'), 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    expect(screen.queryByTestId('task-row-t3')).toBeNull();
  });
});
