import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import type { SharedContent } from '@memex/core';
import { useSaves } from '../data/DataProvider';
import { useJournal } from '../data/useJournal';
import { createFixtureRepository } from '../data/fixtures/fixtureRepository';
import { useEntryActions } from '../journal/useEntryActions';
import { withNetwork } from '../testing/network';
import { NOW, renderWithData } from '../testing/render';
import { ShareSheet } from './ShareSheet';
import { recentSpaces } from './shareModel';

/*
 * The share sheet over the demo repository, saving through the app's real
 * path (useEntryActions().compose → saves → actions → core's capture
 * service), the way the /share screen wires it.
 */

const onClose = jest.fn();
const onSignIn = jest.fn();
const savesRef: { current: ReturnType<typeof useSaves> | null } = { current: null };

const Harness = ({ content, signedIn = true }: { content: SharedContent; signedIn?: boolean }) => {
  const { journal } = useJournal();
  const actions = useEntryActions();
  const saves = useSaves();
  useEffect(() => {
    savesRef.current = saves;
  }, [saves]);
  if (!journal) return null;
  return (
    <ShareSheet
      content={content}
      spaces={recentSpaces(journal.spaces, journal.entries)}
      signedIn={signedIn}
      onClose={onClose}
      onSignIn={onSignIn}
      onSave={async (result) => {
        const where = result.spaces.map((s) => `“${s.name}”`).join(', ');
        await actions.compose(result, { savedMessage: where ? `Saved, filed in ${where}.` : 'Saved to your Journal.' });
        onClose();
      }}
    />
  );
};

const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) {
      jest.advanceTimersByTime(1);
      await new Promise((resolve) => setImmediate(resolve));
    }
  });

const LINK: SharedContent = { kind: 'link', url: 'https://calmtech.com/book', title: '[test] Calm Technology', note: null };

describe('ShareSheet', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    onClose.mockClear();
    onSignIn.mockClear();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('previews a shared link and saves it with a note and a space, as a share', async () => {
    const { repository } = await renderWithData(<Harness content={LINK} />);
    await flush();
    expect(screen.getByLabelText('Link: [test] Calm Technology, https://calmtech.com/book')).toBeTruthy();
    expect(screen.getByText('In your Journal')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Note'), 'For the reading pile');
    await fireEvent.press(screen.getByRole('button', { name: 'File in Kyoto trip' }));
    expect(screen.getByRole('button', { name: 'File in Kyoto trip' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByText('In your Journal, filed in Kyoto trip')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('share-save'));
    await flush();
    const saved = (await repository.links.getAll()).find((l) => l.url === 'https://calmtech.com/book');
    expect(saved).toMatchObject({ title: '[test] Calm Technology', description: 'For the reading pile', captured_by: 'share', captured_client: 'memex-ios/test' });
    const filed = (await repository.spaceLinks.listMembership()).filter((r) => r.link_id === saved?.id).map((r) => r.profile_id);
    expect(filed).toEqual(['kyoto']);
    expect(within(screen.getByTestId('toast')).getByText('Saved, filed in “Kyoto trip”.')).toBeTruthy();
    expect(onClose).toHaveBeenCalled();
  });

  it('files with @Space typed in the note, through the picker', async () => {
    await renderWithData(<Harness content={LINK} />);
    await flush();
    const note = screen.getByLabelText('Note');
    await fireEvent.changeText(note, 'Later @Rea');
    await fireEvent(note, 'selectionChange', { nativeEvent: { selection: { start: 10, end: 10 } } });
    expect(screen.getByText('File in…')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'File in Reading' }));
    expect(screen.getByLabelText('Note').props.value).toBe('Later @Reading ');
    expect(screen.getByText('In your Journal, filed in Reading')).toBeTruthy();
  });

  it('shared text is editable and follows the composer: “[] ” makes a task', async () => {
    const { repository } = await renderWithData(<Harness content={{ kind: 'text', text: 'Buy matcha in Uji' }} />);
    await flush();
    expect(screen.getByLabelText('Shared text').props.value).toBe('Buy matcha in Uji');
    expect(screen.getByRole('button', { name: 'Save jot' })).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Shared text'), '[] [test] Buy matcha in Uji');
    await fireEvent.press(screen.getByRole('button', { name: 'Add task' }));
    await flush();
    expect((await repository.tasks.getAll()).some((t) => t.title === '[test] Buy matcha in Uji')).toBe(true);
  });

  it('offline, Save keeps it on the phone and says so', async () => {
    const net = withNetwork(createFixtureRepository({ now: NOW }));
    await renderWithData(<Harness content={LINK} />, net.repository);
    await flush();
    net.setOnline(false);
    await fireEvent.press(screen.getByTestId('share-save'));
    await flush();
    expect(within(screen.getByTestId('toast')).getByText('No connection. Kept on this phone; it’ll send when you’re back online.')).toBeTruthy();
    expect(savesRef.current?.outbox.items()).toMatchObject([{ status: 'waiting', draft: { kind: 'link', url: 'https://calmtech.com/book', capturedBy: 'share' } }]);
    expect(onClose).toHaveBeenCalled();
  });

  it('signed out, it says so, keeps the item, and offers to sign in', async () => {
    await renderWithData(<Harness content={LINK} signedIn={false} />);
    await flush();
    expect(screen.getByText('You’re signed out of memex')).toBeTruthy();
    expect(screen.getByLabelText('Link: [test] Calm Technology, https://calmtech.com/book')).toBeTruthy();
    expect(screen.queryByTestId('share-save')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(onSignIn).toHaveBeenCalled();
  });

  it('Close closes without saving', async () => {
    const { repository } = await renderWithData(<Harness content={LINK} />);
    await flush();
    const before = (await repository.links.getAll()).length;
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
    expect(await repository.links.getAll()).toHaveLength(before);
  });
});
