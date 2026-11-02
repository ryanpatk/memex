/* global jest */
// Jest setup for component tests (*.test.tsx). Native modules the tests
// touch are mocked here; everything else runs for real (core, React Query,
// the demo repository).
require('@shopify/flash-list/jestSetup');
// Reanimated 4's own mock boots its native runtime under the iOS preset, so
// this covers just what the app uses: views render, animations are instant.
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  const layout = () => {
    const builder = { duration: () => builder, delay: () => builder, springify: () => builder };
    return builder;
  };
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (c) => c },
    useSharedValue: (value) => ({ value, get: () => value, set: () => {} }),
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    withTiming: (v) => v,
    withSpring: (v) => v,
    FadeIn: layout(),
    FadeOut: layout(),
    FadeInDown: layout(),
    FadeOutDown: layout(),
  };
});

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'opened' })),
  WebBrowserPresentationStyle: { PAGE_SHEET: 'pageSheet' },
}));

// Screens use the router; tests read what they asked for from these mocks.
jest.mock('expo-router', () => {
  const React = require('react');
  const router = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) };
  let params = {};
  return {
    __esModule: true,
    useRouter: () => router,
    useLocalSearchParams: () => params,
    useFocusEffect: (effect) => React.useEffect(effect, [effect]),
    __setParams: (next) => {
      params = next;
    },
    __router: router,
  };
});

// Icons are decoration here (every control has a text label); lucide ships ESM only.
jest.mock('lucide-react-native', () =>
  new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : () => null) }),
);
