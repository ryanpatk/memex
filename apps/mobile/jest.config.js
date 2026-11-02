// Component and hook tests (*.test.tsx) run in Jest with jest-expo, which
// loads React Native; plain-TS tests (*.test.ts) stay on Vitest.
module.exports = {
  preset: 'jest-expo/ios',
  testMatch: ['<rootDir>/src/**/*.test.tsx'],
  // @memex/core lives in ../../packages/core: its imports (and the Babel
  // helpers its compiled code needs) resolve from this app, as in Metro.
  modulePaths: ['<rootDir>/node_modules'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // jest-expo's list, plus FlashList (ships ESM).
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@shopify/flash-list|react-native-svg)',
  ],
};
