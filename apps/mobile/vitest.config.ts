import { defineConfig } from 'vitest/config';

// Unit tests for the app's plain-TS modules (*.test.ts: auth storage,
// fixtures, the Journal model, writes, the Library). Nothing here imports
// react-native; component tests (*.test.tsx) run in Jest (jest.config.js).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
