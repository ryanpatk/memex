import { AppState, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';

/*
 * React Query for the app: refetch when the app comes back to the foreground
 * and when the connection comes back (NetInfo), so an error screen recovers
 * on its own. Queries still run while offline (`networkMode: 'always'`):
 * they fail at once and the screen says “You're offline”, rather than
 * waiting paused on a skeleton.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, networkMode: 'always' },
  },
});

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false && state.isInternetReachable !== false)),
);

if (Platform.OS !== 'web') {
  focusManager.setEventListener((setFocused) => {
    const sub = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
    return () => sub.remove();
  });
}
