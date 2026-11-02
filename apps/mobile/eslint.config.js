// The app's own lint (ESLint 9 flat config, eslint-config-expo); the web's
// .eslintrc.cjs at the repo root ignores apps/.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'ios/*', 'android/*', 'expo-env.d.ts'],
  },
]);
