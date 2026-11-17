import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { MC_COLORS_LIGHT } from '@memex/core';
import { NOW, renderWithData } from '../testing/render';
import { themeFor, useTheme } from '../theme/theme';
import SpacesScreen from '../app/(tabs)/spaces';
import { Text } from 'react-native';

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

const LookProbe = () => {
  const t = useTheme();
  return <Text testID="probe">{`${t.look}|${t.cards ? 'tokens' : 'none'}|${t.palette.canvas}`}</Text>;
};

describe('theme selection', () => {
  it('is the classic look by default, with no Memory Cards tokens', async () => {
    await renderWithData(<LookProbe />);
    expect(screen.getByTestId('probe').props.children).toMatch(/^classic\|none\|/);
  });

  it('swaps the palette and adds the tokens in the cards look', async () => {
    await renderWithData(<LookProbe />, undefined, { look: 'cards' });
    expect(screen.getByTestId('probe').props.children).toBe(`cards|tokens|${MC_COLORS_LIGHT.bg}`);
  });

  it('themeFor builds both looks in both appearances', () => {
    expect(themeFor('classic', false).cards).toBeNull();
    expect(themeFor('cards', true).cards?.colors.paper).toBe('#1f242c');
    expect(themeFor('cards', false).palette.ink).toBe(MC_COLORS_LIGHT.ink);
  });
});

describe('screens in the Memory Cards look', () => {
  it('Spaces: a Tasks tile on top, then a tile per space that opens its board', async () => {
    await renderWithData(<SpacesScreen />, undefined, { look: 'cards' });
    await flush();
    const links = screen.getAllByRole('link');
    const tasks = links.find((el) => /^Tasks, \d+ open/.test(el.props.accessibilityLabel ?? ''))!;
    expect(tasks).toBeTruthy();
    fireEvent.press(tasks);
    expect(routerMock.__router.push).toHaveBeenCalledWith('/tasks');
    const tiles = screen.getAllByRole('link').filter((el) => / cards/.test(el.props.accessibilityLabel ?? ''));
    expect(tiles.length).toBeGreaterThan(0);
    fireEvent.press(tiles[0]);
    expect(routerMock.__router.push).toHaveBeenLastCalledWith(expect.objectContaining({ pathname: '/space/[id]' }));
  });

});
