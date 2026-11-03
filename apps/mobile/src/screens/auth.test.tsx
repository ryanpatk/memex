import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderWithData } from '../testing/render';
import SignIn from '../app/sign-in';
import AuthCallback from '../app/auth/callback';

/* Sign-in and the GitHub callback when the network or the server lets them down. */

// The app's Supabase repository: sign-in and the callback call it directly.
const mockAuth = {
  signInWithPassword: jest.fn<() => Promise<{ error: { message: string } | null }>>(),
  exchangeCodeForSession: jest.fn<(code: string) => Promise<{ error: { message: string } | null }>>(),
};
// Getters: the factories run before these consts are set.
jest.mock('../data/repository', () => ({
  get repository() {
    return { auth: mockAuth };
  },
}));
const mockGithub = jest.fn<() => Promise<{ error: string | null }>>();
jest.mock('../auth/signInWithGitHub', () => ({ signInWithGitHub: () => mockGithub() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const routerMock = require('expo-router') as { __router: { replace: jest.Mock }; __setParams: (p: object) => void };

const flush = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  routerMock.__router.replace.mockClear();
  routerMock.__setParams({});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('Sign in', () => {
  it('shows an inline error and frees the buttons when signing in throws', async () => {
    mockAuth.signInWithPassword.mockRejectedValueOnce(new TypeError('Network request failed'));
    await renderWithData(<SignIn />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'me@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'pw');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await flush();
    expect(screen.getByText('Couldn’t reach memex. Check your connection and try again.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' }).props.accessibilityState.disabled).toBe(false);
    expect(screen.getByRole('button', { name: 'Continue with GitHub' }).props.accessibilityState.disabled).toBe(false);
  });

  it('does the same for GitHub', async () => {
    mockGithub.mockRejectedValueOnce(new Error('boom'));
    await renderWithData(<SignIn />);
    await fireEvent.press(screen.getByRole('button', { name: 'Continue with GitHub' }));
    await flush();
    expect(screen.getByText('Couldn’t sign in. Try again.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in' }).props.accessibilityState.disabled).toBe(false);
  });

  it('says why when the GitHub callback sent it back', async () => {
    routerMock.__setParams({ error: 'callback' });
    await renderWithData(<SignIn />);
    expect(screen.getByText('GitHub sign-in didn’t finish. Try again.')).toBeTruthy();
  });
});

describe('GitHub callback', () => {
  it('goes back to sign-in with a message when the code exchange fails', async () => {
    routerMock.__setParams({ code: 'abc' });
    mockAuth.exchangeCodeForSession.mockResolvedValueOnce({ error: { message: 'invalid flow state' } });
    await renderWithData(<AuthCallback />);
    await flush();
    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(routerMock.__router.replace).toHaveBeenCalledWith('/sign-in?error=callback');
    expect(routerMock.__router.replace).not.toHaveBeenCalledWith('/');
  });

  it('and when it throws', async () => {
    routerMock.__setParams({ code: 'abc' });
    mockAuth.exchangeCodeForSession.mockRejectedValueOnce(new TypeError('Network request failed'));
    await renderWithData(<AuthCallback />);
    await flush();
    expect(routerMock.__router.replace).toHaveBeenCalledWith('/sign-in?error=callback');
  });
});
