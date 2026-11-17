import { describe, expect, it, vi } from 'vitest';
import { captureResult, captureStore } from './capture';

const SPACES = [
  { id: 'kyoto', name: 'Kyoto trip' },
  { id: 'studio', name: 'Studio' },
];

describe('Save something: what Save makes', () => {
  it('is nothing until there is text', () => {
    expect(captureResult('   ', 'jot', SPACES, ['kyoto'])).toBeNull();
    expect(captureResult('', 'task', SPACES, [])).toBeNull();
  });

  it('saves a jot in the picked space, merged with any @space typed', () => {
    expect(captureResult('Lime plaster, not paint', 'jot', SPACES, ['kyoto'])).toEqual({
      kind: 'jot',
      body: 'Lime plaster, not paint',
      spaces: [{ id: 'kyoto', name: 'Kyoto trip' }],
    });
    expect(captureResult('Tea at Ippodo @Studio', 'jot', SPACES, ['kyoto'])?.spaces.map((s) => s.id)).toEqual(['kyoto', 'studio']);
  });

  it('makes the kind the toggle says: a note with its first line as the title, a task without typing “[] ”', () => {
    expect(captureResult('Hallway finish\nLime plaster', 'note', SPACES, [])).toMatchObject({ kind: 'note', title: 'Hallway finish' });
    expect(captureResult('Order tile samples', 'task', SPACES, ['studio', 'kyoto'])).toEqual({
      kind: 'task',
      title: 'Order tile samples',
      spaces: [
        { id: 'kyoto', name: 'Kyoto trip' },
        { id: 'studio', name: 'Studio' },
      ],
    });
    expect(captureResult('[] Already a task', 'task', SPACES, [])).toMatchObject({ kind: 'task', title: 'Already a task' });
  });

  it('follows the composer: a lone link saves the link, “[] ” a task', () => {
    expect(captureResult('https://calmtech.com', 'jot', SPACES, [])).toMatchObject({ kind: 'link' });
    expect(captureResult('[] Call the electrician', 'jot', SPACES, [])).toMatchObject({ kind: 'task', title: 'Call the electrician' });
  });
});

describe('captureStore', () => {
  it('opens with what to start from, and closes', () => {
    const listener = vi.fn();
    const stop = captureStore.subscribe(listener);
    captureStore.open({ text: 'plaster' });
    expect(captureStore.get()).toMatchObject({ text: 'plaster', kind: 'jot' });
    const first = captureStore.get()?.key;
    captureStore.open({ kind: 'task' });
    expect(captureStore.get()?.key).not.toBe(first);
    captureStore.close();
    expect(captureStore.get()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(3);
    stop();
  });
});
