import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** `captured_client` for links saved from this app, e.g. `memex-ios/0.1.0` (≤ 80 chars, per the schema). */
export const CLIENT_NAME = `memex-${Platform.OS}/${Constants.expoConfig?.version ?? '0'}`;
