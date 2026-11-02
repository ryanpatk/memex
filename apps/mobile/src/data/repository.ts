import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { Repository } from '@memex/core';
import { createMemexClient, createSupabaseRepository } from '@memex/core/supabase';
import { createEncryptedStorage } from '../auth/encryptedStorage';
import { FIXTURE_MODE, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

/*
 * The app's one Repository (decision 20): Supabase directly through
 * @memex/core, the same adapter as the web. The session is encrypted at rest
 * (key in the keychain, ciphertext in AsyncStorage). In a development build
 * with EXPO_PUBLIC_MEMEX_FIXTURES set, a read-only demo repository stands in.
 */

const keychain = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };

export const encryptedStorage = createEncryptedStorage({
  keys: {
    getItemAsync: (key) => SecureStore.getItemAsync(key, keychain),
    setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, keychain),
    deleteItemAsync: (key) => SecureStore.deleteItemAsync(key, keychain),
  },
  blobs: AsyncStorage,
  randomBytes: (length) => Crypto.getRandomBytes(length),
});

const createRepository = (): Repository => {
  if (__DEV__ && FIXTURE_MODE !== 'off') {
    // DEV-ONLY demo data; `__DEV__ &&` lets the release bundle drop this require.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createFixtureRepository } = require('./fixtures/fixtureRepository') as typeof import('./fixtures/fixtureRepository');
    return createFixtureRepository({ signedIn: FIXTURE_MODE === 'signed-in' });
  }
  return createSupabaseRepository(
    createMemexClient({
      // Placeholders keep the client constructible when .env is missing; the
      // app shows a setup screen instead of signing in (see isConfigured).
      url: SUPABASE_URL || 'https://not-configured.invalid',
      anonKey: SUPABASE_ANON_KEY || 'not-configured',
      auth: {
        storage: encryptedStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    }),
  );
};

export const repository = createRepository();
