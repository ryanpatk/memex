import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, Linking, type AlertButton } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import type { Repository } from '@memex/core';
import { createFixtureRepository } from '../data/fixtures/fixtureRepository';
import { MarkdownView } from '../notes/MarkdownView';
import { withNetwork } from '../testing/network';
import { NOW, renderWithData } from '../testing/render';
import { AccountButton } from '../ui/AccountButton';
import { ErrorBoundary } from '../ui/ErrorScreen';
import InboxScreen from '../app/(tabs)/inbox';
import JournalScreen from '../app/(tabs)/index';
import LibraryScreen from '../app/(tabs)/library';
import SpacesScreen from '../app/(tabs)/spaces';
import LinkDetailScreen from '../app/link/[id]';
import NoteScreen from '../app/note/[id]';
import SpaceScreen from '../app/space/[id]';
import TasksScreen from '../app/tasks';

/*
 * What a screen says when its data didn't load (offline on a cold start, or
 * the server refused): an error with Try again, never the empty state or
 * “deleted on another device”.
 */

// The app's Supabase repository (imported by SessionProvider); screens here use DataProvider's demo one.
jest.mock('../data/repository', () => ({ repository: {} }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const routerMock = require('expo-router') as { __router: { replace: jest.Mock }; __setParams: (p: object) => void };

const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i += 1) {
      jest.advanceTimersByTime(1);
      await new Promise((resolve) => setImmediate(resolve));
    }
  });

/** The demo repository, starting offline. */
const offline = () => {
  const net = withNetwork(createFixtureRepository({ now: NOW }));
  net.setOnline(false);
  return net;
};

const tryAgain = async () => {
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  await flush();
};

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  routerMock.__router.replace.mockClear();
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('Offline on a cold start', () => {
  it('Spaces says offline, not “No spaces yet”, and recovers on Try again', async () => {
    const net = offline();
    await renderWithData(<SpacesScreen />, net.repository);
    await flush();
    expect(screen.getByText('You’re offline')).toBeTruthy();
    expect(screen.queryByText('No spaces yet')).toBeNull();
    expect(screen.queryByText(/Network request failed/)).toBeNull();
    net.setOnline(true);
    await tryAgain();
    expect(screen.getByText('4 spaces')).toBeTruthy();
  });

  it('a space’s board says offline, not “isn’t here anymore”', async () => {
    routerMock.__setParams({ id: 'kyoto' });
    const net = offline();
    await renderWithData(<SpaceScreen />, net.repository);
    await flush();
    expect(screen.getByText('You’re offline')).toBeTruthy();
    expect(screen.queryByText('This space isn’t here anymore')).toBeNull();
    net.setOnline(true);
    await tryAgain();
    expect(screen.getByRole('header', { name: 'Kyoto trip' })).toBeTruthy();
  });

  it('the Inbox says offline, not “Nothing waiting”', async () => {
    await renderWithData(<InboxScreen />, offline().repository);
    await flush();
    expect(screen.getByText('You’re offline')).toBeTruthy();
    expect(screen.queryByText('Nothing waiting')).toBeNull();
    expect(screen.queryByText('All caught up')).toBeNull();
  });

  it('Tasks says offline, not “Nothing to do yet”', async () => {
    routerMock.__setParams({});
    await renderWithData(<TasksScreen />, offline().repository);
    await flush();
    expect(screen.getByText('You’re offline')).toBeTruthy();
    expect(screen.queryByText(/Nothing to do yet/)).toBeNull();
  });

  it('the Journal says offline and keeps its composer, so saves can wait on the phone', async () => {
    routerMock.__setParams({});
    await renderWithData(<JournalScreen />, offline().repository);
    await flush();
    expect(screen.getByText('You’re offline')).toBeTruthy();
    expect(screen.queryByText('Nothing here yet')).toBeNull();
    expect(screen.getByTestId('composer-send')).toBeTruthy();
  });

  it('a note says it didn’t load, not that it was deleted', async () => {
    routerMock.__setParams({ id: 'n1' });
    const net = offline();
    await renderWithData(<NoteScreen />, net.repository);
    await flush();
    expect(screen.getByText('You’re offline')).toBeTruthy();
    expect(screen.queryByText('This note isn’t here anymore')).toBeNull();
    net.setOnline(true);
    await tryAgain();
    expect(screen.getByRole('header', { name: 'Kyoto — first draft itinerary' })).toBeTruthy();
  });

  it('a link says it didn’t load, not that it was deleted', async () => {
    routerMock.__setParams({ id: 'l2' });
    const net = offline();
    await renderWithData(<LinkDetailScreen />, net.repository);
    await flush();
    expect(screen.getByText('You’re offline')).toBeTruthy();
    expect(screen.queryByText('This link isn’t here anymore')).toBeNull();
    net.setOnline(true);
    await tryAgain();
    expect(screen.getByRole('header', { name: 'Calm Technology' })).toBeTruthy();
  });
});

describe('Refused by the server', () => {
  it('names what didn’t load and shows the reason', async () => {
    routerMock.__setParams({});
    const base = createFixtureRepository({ now: NOW });
    const refused: Repository = {
      ...base,
      tasks: {
        ...base.tasks,
        getAll: async () => {
          throw new Error('permission denied for table tasks');
        },
      },
    };
    await renderWithData(<TasksScreen />, refused);
    await flush();
    expect(screen.getByText('Couldn’t load your tasks')).toBeTruthy();
    expect(screen.getByText('permission denied for table tasks')).toBeTruthy();
  });

  it('one failed part is an error, not a Spaces tab with nothing in it', async () => {
    const base = createFixtureRepository({ now: NOW });
    const refused: Repository = {
      ...base,
      spaces: {
        ...base.spaces,
        getAll: async () => {
          throw new Error('JWT expired');
        },
      },
    };
    await renderWithData(<SpacesScreen />, refused);
    await flush();
    expect(screen.getByText('Couldn’t load your spaces')).toBeTruthy();
    expect(screen.queryByText('No spaces yet')).toBeNull();
  });

  it('agents’ proposals that didn’t load get a row with Try again, not “All caught up”', async () => {
    const base = createFixtureRepository({ now: NOW });
    let fail = true;
    const repository: Repository = {
      ...base,
      proposals: {
        ...base.proposals,
        getPending: async () => {
          if (fail) throw new Error('x');
          return base.proposals.getPending();
        },
      },
    };
    await renderWithData(<InboxScreen />, repository);
    await flush();
    expect(screen.getByText('Couldn’t load agents’ proposals')).toBeTruthy();
    expect(screen.queryByText('All caught up')).toBeNull();
    expect(screen.queryByText('From agents')).toBeNull();
    expect(screen.getByText('Filing suggestions')).toBeTruthy();
    fail = false;
    await tryAgain();
    expect(screen.queryByText('Couldn’t load agents’ proposals')).toBeNull();
    expect(screen.getByText('From agents')).toBeTruthy();
    expect(screen.getByText('9 waiting')).toBeTruthy();
  });
});

describe('Pull to refresh', () => {
  it('says so when a refresh fails, and keeps what was on screen', async () => {
    const net = withNetwork(createFixtureRepository({ now: NOW }));
    await renderWithData(<SpacesScreen />, net.repository);
    await flush();
    net.setOnline(false);
    await act(async () => {
      await screen.getByLabelText('Spaces').props.refreshControl.props.onRefresh();
    });
    await flush();
    expect(screen.getByText('Couldn’t refresh: no connection. Showing what was here.')).toBeTruthy();
    expect(screen.getByText('4 spaces')).toBeTruthy();
  });

  it('in the Library too', async () => {
    const net = withNetwork(createFixtureRepository({ now: NOW }));
    await renderWithData(<LibraryScreen />, net.repository);
    await flush();
    net.setOnline(false);
    await act(async () => {
      await screen.getByTestId('library-grid').props.refreshControl.props.onRefresh();
    });
    await flush();
    expect(screen.getByText('Couldn’t refresh: no connection. Showing what was here.')).toBeTruthy();
    expect(screen.getByText('24 links')).toBeTruthy();
  });
});

describe('The root error boundary', () => {
  it('renders with no providers, in calm words, and retries', async () => {
    const retry = jest.fn(() => Promise.resolve());
    await render(<ErrorBoundary error={new Error('boom')} retry={retry} />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.queryByText('boom')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });
});

describe('Links in a note', () => {
  it('opens web links in the in-app browser and mailto: through the system', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await renderWithData(<MarkdownView source={'[site](https://example.com) and [mail](mailto:me@example.com)'} />);
    await fireEvent.press(screen.getByText('site'));
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://example.com', expect.anything());
    await fireEvent.press(screen.getByText('mail'));
    expect(openURL).toHaveBeenCalledWith('mailto:me@example.com');
    expect(WebBrowser.openBrowserAsync).not.toHaveBeenCalledWith('mailto:me@example.com', expect.anything());
  });

  it('says so when a link can’t open', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await renderWithData(<MarkdownView source={'[mail](mailto:me@example.com)'} />);
    await fireEvent.press(screen.getByText('mail'));
    await flush();
    expect(screen.getByText('Couldn’t open that link.')).toBeTruthy();
  });
});

describe('Sign out', () => {
  it('says so when it fails (offline), rather than doing nothing', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(Alert, 'alert').mockImplementationOnce((_title, _message, buttons?: AlertButton[]) => buttons?.find((b) => b.text === 'Sign out')?.onPress?.());
    const base = createFixtureRepository({ now: NOW });
    const repository: Repository = { ...base, auth: { ...base.auth, signOut: async () => ({ error: { message: 'Network request failed' } }) } };
    await renderWithData(<AccountButton />, repository);
    await fireEvent.press(screen.getByRole('button', { name: /^Account/ }));
    await flush();
    expect(screen.getByText('Couldn’t sign out. Check your connection.')).toBeTruthy();
  });
});
