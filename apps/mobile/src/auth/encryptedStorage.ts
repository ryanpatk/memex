import aesjs from 'aes-js';
import type { AuthStorage } from '@memex/core/supabase';

/*
 * Session storage for supabase-js on iOS. SecureStore (the keychain) caps
 * values at 2 KB and a session can outgrow that, so each value is encrypted
 * with a fresh random AES-256 key (CTR mode; a key is never reused): the key
 * lives in the keychain, the ciphertext in AsyncStorage. Losing either one
 * just reads as "signed out". The stores and the random source are injected,
 * so this file is plain TS and unit-tested without a device.
 */

/** The keychain side (expo-secure-store's async API). */
export interface KeyStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

/** The bulk side (AsyncStorage). */
export interface BlobStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface EncryptedStorageDeps {
  keys: KeyStore;
  blobs: BlobStore;
  /** Cryptographically secure random bytes (expo-crypto's getRandomBytes). */
  randomBytes: (length: number) => Uint8Array;
}

/** SecureStore keys may only hold letters, digits, `.`, `-` and `_`. */
export const keychainKey = (key: string) => `memex.k.${key.replace(/[^\w.-]/g, '_')}`;
const blobKey = (key: string) => `memex.s.${key}`;

const cipher = (key: Uint8Array) => new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(1));

export const createEncryptedStorage = ({ keys, blobs, randomBytes }: EncryptedStorageDeps): AuthStorage => ({
  async getItem(key) {
    const [encrypted, hexKey] = await Promise.all([blobs.getItem(blobKey(key)), keys.getItemAsync(keychainKey(key))]);
    if (!encrypted || !hexKey) return null;
    try {
      const bytes = cipher(aesjs.utils.hex.toBytes(hexKey)).decrypt(aesjs.utils.hex.toBytes(encrypted));
      return aesjs.utils.utf8.fromBytes(bytes);
    } catch {
      return null;
    }
  },

  async setItem(key, value) {
    const secret = randomBytes(32);
    const encrypted = cipher(secret).encrypt(aesjs.utils.utf8.toBytes(value));
    await keys.setItemAsync(keychainKey(key), aesjs.utils.hex.fromBytes(secret));
    await blobs.setItem(blobKey(key), aesjs.utils.hex.fromBytes(encrypted));
  },

  async removeItem(key) {
    await Promise.all([blobs.removeItem(blobKey(key)), keys.deleteItemAsync(keychainKey(key))]);
  },
});
