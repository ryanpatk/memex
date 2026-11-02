module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  // apps/* have their own lint (apps/mobile: ESLint 9 + eslint-config-expo).
  ignorePatterns: ['dist', '.eslintrc.cjs', 'extension/.output', 'extension/.wxt', 'api/.wrangler', 'scraper/.wrangler', 'apps'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
}
