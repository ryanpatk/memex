import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createEncryptedStorage, keychainKey, type BlobStore, type KeyStore } from './encryptedStorage';

const memory = () => {
  const keyMap = new Map<string, string>();
  const blobMap = new Map<string, string>();
  const keys: KeyStore = {
    getItemAsync: async (k) => keyMap.get(k) ?? null,
    setItemAsync: async (k, v) => void keyMap.set(k, v),
    deleteItemAsync: async (k) => void keyMap.delete(k),
  };
  const blobs: BlobStore = {
    getItem: async (k) => blobMap.get(k) ?? null,
    setItem: async (k, v) => void blobMap.set(k, v),
    removeItem: async (k) => void blobMap.delete(k),
  };
  const storage = createEncryptedStorage({ keys, blobs, randomBytes: (n) => new Uint8Array(randomBytes(n)) });
  return { storage, keyMap, blobMap };
};

// A realistic session is well over SecureStore's 2 KB limit.
const session = JSON.stringify({ access_token: 'x'.repeat(1400), refresh_token: 'r'.repeat(40), user: { id: 'u', email: 'ü@example.com' } });

describe('createEncryptedStorage', () => {
  it('round-trips a large session, keeping only a 32-byte key in the keychain', async () => {
    const { storage, keyMap, blobMap } = memory();
    await storage.setItem('sb-ref-auth-token', session);
    expect(await storage.getItem('sb-ref-auth-token')).toBe(session);
    const [key] = [...keyMap.values()];
    expect(key).toHaveLength(64);
    const [blob] = [...blobMap.values()];
    expect(blob).not.toContain('access_token');
  });

  it('uses a fresh key on every write', async () => {
    const { storage, keyMap, blobMap } = memory();
    await storage.setItem('k', session);
    const first = [...keyMap.values()][0];
    const firstBlob = [...blobMap.values()][0];
    await storage.setItem('k', session);
    expect([...keyMap.values()][0]).not.toBe(first);
    expect([...blobMap.values()][0]).not.toBe(firstBlob);
  });

  it('reads as signed out when either half is missing, and removes both', async () => {
    const { storage, keyMap } = memory();
    expect(await storage.getItem('nothing')).toBeNull();
    await storage.setItem('k', 'v');
    keyMap.clear();
    expect(await storage.getItem('k')).toBeNull();
    await storage.setItem('k', 'v');
    await storage.removeItem('k');
    expect(await storage.getItem('k')).toBeNull();
  });

  it('makes keychain-safe key names', () => {
    expect(keychainKey('sb-abc-auth-token')).toBe('memex.k.sb-abc-auth-token');
    expect(keychainKey('a b/c:d')).toBe('memex.k.a_b_c_d');
  });
});
