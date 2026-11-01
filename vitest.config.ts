import { defineConfig } from 'vitest/config';

// Unit tests for @memex/core, memex-api and the web app's pure modules. Node
// environment: nothing under test touches the DOM.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'src/**/*.test.ts', 'api/src/**/*.test.ts'],
    environment: 'node',
    // Vitest blanks CSS imports by default; the token drift test reads the
    // theme stylesheets with `?raw`, so let those two through.
    css: { include: [/src\/styles\/(pastel-sky|components)\.css/] },
  },
});
