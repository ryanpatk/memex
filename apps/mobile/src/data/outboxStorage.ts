import type { OutboxStorage } from '@memex/core';
import { FIXTURE_MODE } from './config';
import { encryptedStorage } from './repository';

/*
 * Saves waiting for a connection, kept on the phone the way the session is:
 * encrypted with a fresh key per write (key in the keychain, ciphertext in
 * AsyncStorage; see auth/encryptedStorage.ts). Demo data keeps its own queue.
 */
const KEY = FIXTURE_MODE === 'off' ? 'outbox' : 'outbox-demo';

export const outboxStorage: OutboxStorage = {
  read: async () => (await encryptedStorage.getItem(KEY)) ?? null,
  write: async (value) => {
    await encryptedStorage.setItem(KEY, value);
  },
};
