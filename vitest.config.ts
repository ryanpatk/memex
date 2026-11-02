import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for @memex/core, memex-api, the extension's site matchers and
// the web app's pure modules. Node environment: nothing under test touches the DOM.
export default defineConfig({
  // The extension's own `@/` alias (WXT), so its pure modules can be tested here.
  resolve: { alias: { '@/': fileURLToPath(new URL('./extension/', import.meta.url)) } },
  // A fixed tsconfig for transforms: extension/tsconfig.json extends WXT's
  // generated .wxt/tsconfig.json, which only exists after `npm install` in
  // extension/, and nothing under test needs per-folder compiler options.
  esbuild: { tsconfigRaw: '{"compilerOptions":{"target":"ES2022","useDefineForClassFields":true}}' },
  test: {
    include: ['packages/*/src/**/*.test.ts', 'src/**/*.test.ts', 'api/src/**/*.test.ts', 'extension/sources/**/*.test.ts'],
    environment: 'node',
    // Vitest blanks CSS imports by default; the token drift test reads the
    // theme stylesheets with `?raw`, so let those two through.
    css: { include: [/src\/styles\/(pastel-sky|components)\.css/] },
  },
});
