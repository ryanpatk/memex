import { defineConfig } from 'vitest/config';

// Unit tests for the app's plain-TS modules (auth storage, fixtures, the
// Journal model glue). Nothing here imports react-native.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
