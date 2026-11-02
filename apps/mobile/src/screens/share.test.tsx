import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { shareDraft } from '../share/shareDraft';
import { renderWithData } from '../testing/render';
import ShareScreen from '../app/share';

/*
 * The /share route: what arrives (the extension's item or link params), Save
 * and Close, and signed out. The native module and the session are mocked.
 */

const mockIntent = {
  hasShareIntent: false,
  shareIntent: { text: null as string | null, webUrl: null as string | null, meta: null as { title?: string } | null },
  resetShareIntent: jest.fn(),
};
jest.mock('expo-share-intent', () => ({ useShareIntentContext: () => mockIntent }));
let mockSignedIn = true;
jest.mock('../auth/SessionProvider', () => ({
  useSession: () => ({ ready: true, session: mockSignedIn ? { user: { id: 'demo-user' } } : null }),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const routerMock = require('expo-router') as { __router: { back: jest.Mock; replace: jest.Mock }; __setParams: (p: object) => void };

const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) {
      jest.advanceTimersByTime(1);
      await new Promise((resolve) => setImmediate(resolve));
    }
  });

describe('/share', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    shareDraft.clear();
    mockSignedIn = true;
    mockIntent.hasShareIntent = false;
    mockIntent.resetShareIntent.mockClear();
    routerMock.__router.back.mockClear();
    routerMock.__router.replace.mockClear();
    routerMock.__setParams({});
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('takes the extension’s item (Safari’s URL and title) and lets the native module forget it', async () => {
    mockIntent.hasShareIntent = true;
    mockIntent.shareIntent = { text: 'https://calmtech.com/', webUrl: 'https://calmtech.com/', meta: { title: '[test] Calm Technology' } };
    await renderWithData(<ShareScreen />, undefined);
    await flush();
    expect(screen.getByLabelText('Link: [test] Calm Technology, https://calmtech.com/')).toBeTruthy();
    expect(mockIntent.resetShareIntent).toHaveBeenCalled();
  });

  it('saves from link params, closes, and the params don’t refill the sheet', async () => {
    routerMock.__setParams({ url: 'https://example.org/test-share', title: '[test] Shared page' });
    const { repository, rerender } = await renderWithData(<ShareScreen />);
    await flush();
    await fireEvent.press(screen.getByTestId('share-save'));
    await flush();
    expect((await repository.links.getAll()).filter((l) => l.url === 'https://example.org/test-share')).toHaveLength(1);
    expect(routerMock.__router.back).toHaveBeenCalled();
    expect(shareDraft.get()).toBeNull();
    // The router hands the screen a fresh params object with the same values; it mustn't refill.
    routerMock.__setParams({ url: 'https://example.org/test-share', title: '[test] Shared page' });
    await rerender(<ShareScreen />);
    await flush();
    expect(shareDraft.get()).toBeNull();
  });

  it('says when nothing arrived, instead of waiting forever', async () => {
    await renderWithData(<ShareScreen />, undefined);
    await act(async () => jest.advanceTimersByTime(4000));
    await flush();
    expect(screen.getByText('Nothing to save')).toBeTruthy();
  });

  it('signed out: keeps the item and goes to sign in', async () => {
    mockSignedIn = false;
    routerMock.__setParams({ url: 'https://example.org/test-share' });
    await renderWithData(<ShareScreen />);
    await flush();
    expect(screen.getByText('You’re signed out of memex')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(routerMock.__router.replace).toHaveBeenCalledWith('/sign-in');
    expect(shareDraft.get()).toMatchObject({ url: 'https://example.org/test-share' });
  });
});


