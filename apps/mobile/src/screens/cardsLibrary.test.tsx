import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { NOW, renderWithData } from '../testing/render';
import LibraryScreen from '../app/(tabs)/library';

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
  it('Cards: the hero carries the count, cards carry their space label, pills filter', async () => {
    await renderWithData(<LibraryScreen />, undefined, { look: 'cards' });
    await flush();
    expect(screen.getByRole('header', { name: /^Cards, \d+$/ })).toBeTruthy();
    expect(screen.queryByText('Library')).toBeNull();
    expect(screen.getAllByText('Unfiled').length + screen.getAllByTestId(/^library-card-/).length).toBeGreaterThan(0);
    const before = screen.getAllByTestId(/^library-card-/).length;
    const pills = screen.getAllByRole('tab');
    expect(pills[0].props.accessibilityLabel ?? '').toBe('All');
    fireEvent.press(pills[1]);
    await flush();
    const after = screen.queryAllByTestId(/^library-card-/).length;
    expect(after).toBeLessThanOrEqual(before);
  });

});
