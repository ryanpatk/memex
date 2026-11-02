import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { useJournal } from '../data/useJournal';
import { NOW, renderWithData } from '../testing/render';
import { Composer } from './Composer';
import { JournalFeed } from './JournalFeed';
import { useEntryActions } from './useEntryActions';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __router: router } = require('expo-router') as { __router: { push: jest.Mock } };

/** The Journal screen's moving parts (feed + composer) over the demo repository. */
const Journal = () => {
  const { journal } = useJournal();
  const actions = useEntryActions();
  if (!journal) return null;
  return (
    <>
      <JournalFeed parts={journal.feed} spaces={journal.spaces} filer={journal.filer} refreshing={false} onRefresh={() => {}} />
      <Composer spaces={journal.spaces} filer={journal.filer} onSubmit={actions.compose} now={() => NOW} />
    </>
  );
};

/**
 * Let pending work settle inside act: Repository promises, and React Query's
 * batched notifications (scheduled with setTimeout 0, so the fake clock ticks).
 */
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) {
      jest.advanceTimersByTime(1);
      await new Promise((resolve) => setImmediate(resolve));
    }
  });

const mount = async () => {
  const utils = await renderWithData(<Journal />);
  await screen.findByLabelText('Write in your Journal');
  return utils;
};

describe('Journal interactions', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    router.push.mockClear();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('ticks a task, saving it through the Repository', async () => {
    const { repository } = await mount();
    const check = screen.getByRole('checkbox', { name: 'Renew passport photos' });
    expect(check.props.accessibilityState.checked).toBe(false);
    await fireEvent.press(check);
    await flush();
    expect(screen.getByRole('checkbox', { name: 'Renew passport photos' }).props.accessibilityState.checked).toBe(true);
    expect((await repository.tasks.getAll()).find((t) => t.id === 't3')?.is_done).toBe(true);
  });

  it('deletes with Undo: hidden at once, nothing written if undone', async () => {
    const { repository } = await mount();
    const jot = screen.getByLabelText(/^Jot at .*: Coffee, then the phone app/);
    await fireEvent(jot, 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    expect(screen.queryByLabelText(/Coffee, then the phone app/)).toBeNull();
    const toast = screen.getByTestId('toast');
    expect(within(toast).getByText('Deleted “Coffee, then the phone app ☕️”.')).toBeTruthy();
    await fireEvent.press(within(toast).getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText(/Coffee, then the phone app/)).toBeTruthy();
    await act(async () => jest.advanceTimersByTime(7000));
    expect((await repository.jots.getAll()).some((j) => j.id === 'j4')).toBe(true);
  });

  it('deletes for real once the Undo window passes', async () => {
    const { repository } = await mount();
    await fireEvent(screen.getByLabelText('Task: Sketch the share sheet flow'), 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    expect(screen.queryByLabelText('Task: Sketch the share sheet flow')).toBeNull();
    expect((await repository.tasks.getAll()).some((t) => t.id === 't2')).toBe(true);
    await act(async () => jest.advanceTimersByTime(6000));
    await flush();
    expect((await repository.tasks.getAll()).some((t) => t.id === 't2')).toBe(false);
    expect(screen.queryByLabelText('Task: Sketch the share sheet flow')).toBeNull();
  });

  it('opens link detail from a link', async () => {
    await mount();
    await fireEvent.press(screen.getByLabelText('Notes on a personal library, for the reading pile, are.na'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/link/[id]', params: { id: 'l3' } });
  });

  it('files an entry from its suggestion chip, with Undo', async () => {
    const { repository } = await mount();
    // The demo's are.na link mentions “the reading pile”, so the filer suggests Reading.
    const chip = screen.getByRole('button', { name: 'File in Reading' });
    expect(chip.props.accessibilityHint).toBe('Mentions “Reading”');
    await fireEvent.press(chip);
    await flush();
    expect(within(screen.getByTestId('toast')).getByText('Filed in “Reading”.')).toBeTruthy();
    const filed = async () => (await repository.spaceLinks.listMembership()).some((r) => r.link_id === 'l3' && r.profile_id === 'reading');
    expect(await filed()).toBe(true);
    await fireEvent.press(within(screen.getByTestId('toast')).getByRole('button', { name: 'Undo' }));
    await flush();
    expect(await filed()).toBe(false);
  });

  it('composes a task with @Space that appears in the feed, filed', async () => {
    const { repository } = await mount();
    const field = screen.getByLabelText('Write in your Journal');
    await fireEvent.changeText(field, '[] Pack the tripod @Kyoto trip');
    await fireEvent.press(screen.getByLabelText('Add task'));
    await flush();
    expect(screen.getByRole('checkbox', { name: 'Pack the tripod' })).toBeTruthy();
    const task = (await repository.tasks.getAll()).find((t) => t.title === 'Pack the tripod');
    expect(task).toBeTruthy();
    expect((await repository.spaceTasks.listMembership()).some((r) => r.task_id === task?.id && r.profile_id === 'kyoto')).toBe(true);
  });

  it('composes a link and a jot', async () => {
    const { repository } = await mount();
    const field = screen.getByLabelText('Write in your Journal');
    await fireEvent.changeText(field, 'https://www.kinfolk.com/slow-mornings/');
    await fireEvent.press(screen.getByLabelText('Save link'));
    await flush();
    expect(screen.getByLabelText(/kinfolk\.com$/)).toBeTruthy();
    expect((await repository.links.getAll()).find((l) => l.url === 'https://www.kinfolk.com/slow-mornings/')).toMatchObject({
      captured_by: 'app',
      captured_client: 'memex-ios/test',
    });
    await fireEvent.changeText(field, 'Slow morning, good light');
    await fireEvent.press(screen.getByLabelText('Send jot'));
    await flush();
    expect(screen.getByLabelText(/^Jot at .*: Slow morning, good light/)).toBeTruthy();
    expect((await repository.jots.getAll()).some((j) => j.body === 'Slow morning, good light')).toBe(true);
  });
});
