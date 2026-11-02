import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ComposerResult } from '@memex/core';
import { buildDemoData } from '../data/fixtures/demoData';
import { toJournal } from '../data/journal';
import { ThemeProvider } from '../theme/theme';
import { Composer } from './Composer';

const NOW = new Date(2026, 10, 1, 12, 0);
const journal = toJournal(buildDemoData(NOW), '#5077ff', NOW);
type Sent = Exclude<ComposerResult, { kind: 'empty' }>;

const setup = async (onSubmit = jest.fn<(result: Sent) => Promise<void>>(() => Promise.resolve())) => {
  await render(
    <ThemeProvider>
      <Composer spaces={journal.spaces} filer={journal.filer} onSubmit={onSubmit} now={() => NOW} />
    </ThemeProvider>,
  );
  const field = screen.getByLabelText('Write in your Journal');
  const type = async (text: string) => {
    await fireEvent.changeText(field, text);
    await fireEvent(field, 'selectionChange', { nativeEvent: { selection: { start: text.length, end: text.length } } });
  };
  return { onSubmit, field, type };
};

describe('Composer', () => {
  it('sends a jot, and says what send will make', async () => {
    const { onSubmit, type, field } = await setup();
    expect(screen.getByLabelText('Send jot')).toBeTruthy();
    await type('Tea at Ippodo');
    await fireEvent.press(screen.getByLabelText('Send jot'));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ kind: 'jot', body: 'Tea at Ippodo', spaces: [] });
    expect(field.props.value).toBe('');
  });

  it('recognises a link and a task', async () => {
    const { type } = await setup();
    await type('https://calmtech.com');
    expect(screen.getByLabelText('Save link')).toBeTruthy();
    await type('[] Pack the tripod');
    expect(screen.getByLabelText('Add task')).toBeTruthy();
  });

  it('files with the @ picker: pick a space, then send a task with it', async () => {
    const { onSubmit, type, field } = await setup();
    await type('[] Book the ryokan @ky');
    await fireEvent.press(screen.getByLabelText('File in Kyoto trip'));
    expect(field.props.value).toBe('[] Book the ryokan @Kyoto trip ');
    expect(screen.getByLabelText('Will be filed in Kyoto trip')).toBeTruthy();
    await fireEvent(field, 'submitEditing');
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ kind: 'task', title: 'Book the ryokan', spaces: [{ id: 'kyoto', name: 'Kyoto trip', color: expect.any(String) }] });
  });

  it('offers the filer’s suggestion for the draft, and one press adds it', async () => {
    const { type, field } = await setup();
    await type('[] Book the ryokan for Arashiyama');
    const chip = screen.getByLabelText('File in Kyoto trip? Similar to other things in Kyoto trip');
    await fireEvent.press(chip);
    expect(field.props.value).toBe('[] Book the ryokan for Arashiyama @Kyoto trip ');
  });

  it('saves a note when the note button is on (Return makes lines)', async () => {
    const { onSubmit, type, field } = await setup();
    await fireEvent.press(screen.getByLabelText('Write a note'));
    expect(field.props.submitBehavior).toBe('newline');
    await type('Packing list\n- tripod');
    await fireEvent.press(screen.getByLabelText('Save note'));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({ kind: 'note', title: 'Packing list', body: 'Packing list\n- tripod', spaces: [] });
  });

  it('puts the text back when the save fails', async () => {
    let fail: (e: Error) => void = () => {};
    const onSubmit = jest.fn(() => new Promise<void>((_, reject) => (fail = reject)));
    const { type, field } = await setup(onSubmit);
    await type('Will not save');
    await fireEvent.press(screen.getByLabelText('Send jot'));
    expect(field.props.value).toBe('');
    await act(async () => fail(new Error('offline')));
    expect(field.props.value).toBe('Will not save');
  });

  it('does nothing on an empty send', async () => {
    const { onSubmit } = await setup();
    await fireEvent.press(screen.getByLabelText('Send jot'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
