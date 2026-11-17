import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, screen } from '@testing-library/react-native';
import { NOW, renderWithData } from '../testing/render';
import JournalScreen from '../app/(tabs)/index';

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

describe('the Memory Cards look', () => {
  it('Journal: the hero reads Today, and the Tasks button moves to the Spaces tab', async () => {
    await renderWithData(<JournalScreen />, undefined, { look: 'cards' });
    await flush();
    expect(screen.getAllByText('Today').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/^Today, \d+$/).length).toBe(1);
    expect(screen.queryByRole('button', { name: /^Tasks/ })).toBeNull();
  });
});
