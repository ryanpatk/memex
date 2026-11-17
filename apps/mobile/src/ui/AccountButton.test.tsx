import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import type { AuthSession } from '@memex/core';
import { renderWithData } from '../testing/render';
import { AccountButton } from './AccountButton';

/* The account disc shows the GitHub picture, and the letter when there isn't one or it fails. */

let mockSession: AuthSession | null = null;
jest.mock('../auth/SessionProvider', () => ({ useSession: () => ({ session: mockSession, ready: true }) }));

const signedIn = (user_metadata: AuthSession['user']['user_metadata']): AuthSession => ({
  access_token: 't',
  user: { id: 'u1', email: 'octo@example.com', user_metadata },
});

afterEach(() => {
  mockSession = null;
});

describe('AccountButton', () => {
  it('shows the GitHub avatar, sized for the disc', async () => {
    mockSession = signedIn({ avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4', user_name: 'octo', full_name: 'Octo Cat' });
    await renderWithData(<AccountButton />);
    const picture = screen.getByLabelText('octo');
    expect(JSON.stringify(picture.props.source)).toContain('avatars.githubusercontent.com/u/1?v=4&s=');
    expect(screen.queryByText('O')).toBeNull();
  });

  it('falls back to the letter when the picture fails to load', async () => {
    mockSession = signedIn({ avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4', user_name: 'octo', full_name: 'Octo Cat' });
    await renderWithData(<AccountButton />);
    await fireEvent(screen.getByLabelText('octo'), 'error', { nativeEvent: { error: 'failed' } });
    expect(screen.queryByLabelText('octo')).toBeNull();
    expect(screen.getByText('O')).toBeTruthy();
  });

  it('shows the letter when the session has no picture', async () => {
    mockSession = signedIn({ full_name: 'Ryan' });
    await renderWithData(<AccountButton />);
    expect(screen.getByText('R')).toBeTruthy();
  });
});
