import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';
import { useJournal } from '../data/useJournal';
import { JournalFeed } from '../journal/JournalFeed';
import { renderWithData } from '../testing/render';
import NoteScreen from '../app/note/[id]';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const routerMock = require('expo-router') as { __router: { push: jest.Mock; back: jest.Mock; replace: jest.Mock }; __setParams: (p: object) => void };

const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });

const mount = async (id = 'n1') => {
  routerMock.__setParams({ id });
  const utils = await renderWithData(<NoteScreen />);
  await flush();
  return utils;
};

/** Answer the next Alert with the button labelled `label`. */
const answer = (label: string) =>
  jest.spyOn(Alert, 'alert').mockImplementationOnce((_title, _message, buttons?: AlertButton[]) => buttons?.find((b) => b.text === label)?.onPress?.());

beforeEach(() => {
  routerMock.__router.push.mockClear();
  routerMock.__router.back.mockClear();
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('Note view', () => {
  it('renders the note’s markdown, with its spaces', async () => {
    await mount();
    expect(screen.getByRole('header', { name: 'Kyoto — first draft itinerary' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Day 1' })).toBeTruthy();
    expect(screen.getByRole('header', { name: 'Day 2' })).toBeTruthy();
    expect(screen.getByText('Arashiyama at dawn, bamboo before the crowds. Tenryū-ji garden.')).toBeTruthy();
    expect(screen.getByText('Kyoto trip')).toBeTruthy();
  });

  it('edits the markdown and saves it through the Repository', async () => {
    const { repository } = await mount();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Note title').props.value).toBe('Kyoto — first draft itinerary');
    await fireEvent.changeText(screen.getByLabelText('Note text'), '## Day 1\n[test] Arashiyama at dawn.\n\n- [ ] book bikes');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await flush();
    expect((await repository.notes.getAll()).find((n) => n.id === 'n1')?.body).toBe('## Day 1\n[test] Arashiyama at dawn.\n\n- [ ] book bikes');
    expect(screen.getByText('Note saved.')).toBeTruthy();
    expect(screen.queryByLabelText('Note text')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'book bikes' }).props.accessibilityState.checked).toBe(false);
  });

  it('asks before saving over a note that changed elsewhere meanwhile', async () => {
    const { repository, queryClient } = await mount();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    await fireEvent.changeText(screen.getByLabelText('Note text'), '[test] mine');
    // Another device saves the note while this one is editing.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await repository.notes.update('n1', { body: '[test] theirs' });
      await queryClient.invalidateQueries({ queryKey: ['notes'] });
    });
    await flush();
    answer('Keep editing');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await flush();
    expect((await repository.notes.getAll()).find((n) => n.id === 'n1')?.body).toBe('[test] theirs');
    answer('Save mine');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await flush();
    expect((await repository.notes.getAll()).find((n) => n.id === 'n1')?.body).toBe('[test] mine');
  });

  it('asks before dropping unsaved changes', async () => {
    const { repository } = await mount();
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    await fireEvent.changeText(screen.getByLabelText('Note title'), '[test] renamed');
    answer('Keep editing');
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(routerMock.__router.back).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Note title')).toBeTruthy();
    answer('Discard');
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(routerMock.__router.back).toHaveBeenCalled();
    expect((await repository.notes.getAll()).find((n) => n.id === 'n1')?.title).toBe('Kyoto — first draft itinerary');
  });

  it('cancels without asking when nothing changed', async () => {
    await mount();
    const alert = jest.spyOn(Alert, 'alert');
    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
  });

  it('says so when the note is gone', async () => {
    await mount('nope');
    expect(screen.getByText('This note isn’t here anymore')).toBeTruthy();
  });
});

describe('Opening a note from the Journal', () => {
  const Feed = () => {
    const { journal } = useJournal();
    return journal ? <JournalFeed parts={journal.feed} spaces={journal.spaces} filer={journal.filer} refreshing={false} onRefresh={() => {}} /> : null;
  };

  it('pushes the note view when a note is tapped', async () => {
    await renderWithData(<Feed />);
    await flush();
    await fireEvent.press(screen.getByLabelText('Note: Portfolio — memex case study'));
    expect(routerMock.__router.push).toHaveBeenCalledWith({ pathname: '/note/[id]', params: { id: 'n2' } });
  });
});
