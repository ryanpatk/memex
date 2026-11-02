import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { useOutboxSync } from '../data/useOutboxSync';
import { useJournal } from '../data/useJournal';
import { createFixtureRepository } from '../data/fixtures/fixtureRepository';
import { withNetwork } from '../testing/network';
import { NOW, renderWithData } from '../testing/render';
import { Composer } from './Composer';
import { JournalFeed } from './JournalFeed';
import { usePendingSaves } from './PendingSaves';
import { useEntryActions } from './useEntryActions';

/*
 * Offline saves in the Journal: the composer's save is kept on the phone and
 * shows as a pending row at the newest end; Retry sends it, Discard drops
 * the local copy (with Undo), and the outbox's sync sends it on its own.
 */

const Journal = () => {
  useOutboxSync('demo-user');
  const { journal } = useJournal();
  const actions = useEntryActions();
  const pending = usePendingSaves();
  if (!journal) return null;
  return (
    <>
      <JournalFeed parts={journal.feed} spaces={journal.spaces} filer={journal.filer} refreshing={false} onRefresh={() => {}} pending={pending} />
      <Composer spaces={journal.spaces} filer={journal.filer} onSubmit={actions.compose} now={() => NOW} />
    </>
  );
};

const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) {
      jest.advanceTimersByTime(1);
      await new Promise((resolve) => setImmediate(resolve));
    }
  });

const mount = async () => {
  const net = withNetwork(createFixtureRepository({ now: NOW }));
  const utils = await renderWithData(<Journal />, net.repository);
  await screen.findByLabelText('Write in your Journal');
  await flush();
  return { ...utils, ...net };
};

const send = async (text: string) => {
  const field = screen.getByLabelText('Write in your Journal');
  await fireEvent.changeText(field, text);
  await fireEvent(field, 'submitEditing');
  await flush();
};

describe('Pending saves in the Journal', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('offline, a jot is kept on the phone, shown as waiting, and the box is cleared', async () => {
    const { setOnline } = await mount();
    setOnline(false);
    await send('[test] written on the train');
    expect(screen.getByLabelText('Write in your Journal').props.value).toBe('');
    expect(within(screen.getByTestId('toast')).getByText('No connection. Kept on this phone; it’ll send when you’re back online.')).toBeTruthy();
    const row = screen.getByLabelText('Jot not sent yet: [test] written on the train. Waiting for a connection');
    expect(row).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('Retry while still offline keeps it waiting; once online, Retry saves it once and the row goes', async () => {
    const { setOnline, repository } = await mount();
    setOnline(false);
    await send('[test] the moss garden');
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await flush();
    expect(screen.getByLabelText(/Jot not sent yet: \[test\] the moss garden\. Waiting for a connection · tried 2 times/)).toBeTruthy();

    setOnline(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await flush();
    expect(screen.queryByTestId('pending-saves')).toBeNull();
    expect((await repository.jots.getAll()).filter((j) => j.body === '[test] the moss garden')).toHaveLength(1);
    expect(screen.getByLabelText(/^Jot at .*: \[test\] the moss garden/)).toBeTruthy();
  });

  it('sends on its own after the backoff once the connection is back', async () => {
    const { setOnline, repository } = await mount();
    setOnline(false);
    await send('[] [test] book the ryokan');
    expect(screen.getByTestId('pending-saves')).toBeTruthy();
    setOnline(true);
    await act(async () => jest.advanceTimersByTime(10_000));
    await flush();
    expect(screen.queryByTestId('pending-saves')).toBeNull();
    expect((await repository.tasks.getAll()).filter((t) => t.title === '[test] book the ryokan')).toHaveLength(1);
    expect(within(screen.getByTestId('toast')).getByText('Sent 1 save kept on this phone.')).toBeTruthy();
  });

  it('Discard drops only the copy on the phone, with Undo', async () => {
    const { setOnline, repository, calls } = await mount();
    setOnline(false);
    await send('[test] never mind');
    calls.length = 0;
    await fireEvent.press(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByTestId('pending-saves')).toBeNull();
    const toast = screen.getByTestId('toast');
    expect(within(toast).getByText('Discarded “[test] never mind” from this phone.')).toBeTruthy();
    expect(calls).toEqual([]);
    await fireEvent.press(within(toast).getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText(/Jot not sent yet: \[test\] never mind/)).toBeTruthy();
    setOnline(true);
    expect((await repository.jots.getAll()).some((j) => j.body === '[test] never mind')).toBe(false);
  });

  it('a save the server refuses shows why, and stays until Retry or Discard', async () => {
    const { repository } = await mount();
    const create = repository.jots.create;
    repository.jots.create = async () => {
      throw new TypeError('Network request failed');
    };
    await send('[test] refused later');
    repository.jots.create = async () => {
      throw new Error('new row violates row-level security policy');
    };
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await flush();
    expect(screen.getByText('Couldn’t save: new row violates row-level security policy')).toBeTruthy();
    repository.jots.create = create;
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    await flush();
    expect(screen.queryByTestId('pending-saves')).toBeNull();
  });
});
