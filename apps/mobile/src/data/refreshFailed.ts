import { isTransientError } from '@memex/core';

/** The toast when a refresh fails but what was on screen stays: the older copy is still shown. */
export const refreshFailed = (error: unknown) =>
  isTransientError(error) ? 'Couldn’t refresh: no connection. Showing what was here.' : 'Couldn’t refresh. Showing what was here.';
