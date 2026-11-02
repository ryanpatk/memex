import { useEffect, useSyncExternalStore } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack, usePathname, useRouter } from 'expo-router';
import { ShareIntentModule, ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useFonts,
  Inter_400Regular,
  Inter_400Regular_Italic,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_600SemiBold_Italic,
} from '@expo-google-fonts/inter';
import { Nunito_900Black } from '@expo-google-fonts/nunito';
import { SessionProvider, useSession } from '../auth/SessionProvider';
import { CLIENT_NAME } from '../data/client';
import { FIXTURE_MODE, isConfigured } from '../data/config';
import { DataProvider } from '../data/DataProvider';
import { outboxStorage } from '../data/outboxStorage';
import { queryClient } from '../data/queryClient';
import { repository } from '../data/repository';
import { scrapeLink, scraperEnabled } from '../data/scraper';
import { useOutboxSync } from '../data/useOutboxSync';
import { shareDraft } from '../share/shareDraft';
import { ThemeProvider, useTheme } from '../theme/theme';
import { SetupNeeded } from '../ui/SetupNeeded';
import { ToastProvider } from '../ui/Toast';

// Link metadata from the scraper Worker; demo data stays offline.
const enrich = scraperEnabled && FIXTURE_MODE === 'off' ? scrapeLink : undefined;

/** Screens opened by a link (the share sheet on a cold start) sit over the Journal, not alone. */
export const unstable_settings = { anchor: '(tabs)' };

// The share extension's native module (null in Expo Go, where there's no extension).
const shareIntentOptions = { disabled: !ShareIntentModule, resetOnBackground: false };

void SplashScreen.preventAutoHideAsync();

/** Providers, fonts, and the signed-in / signed-out split (Stack.Protected). */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_400Regular_Italic,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_600SemiBold_Italic,
    Nunito_900Black,
  });
  return (
    <ShareIntentProvider options={shareIntentOptions}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <ToastProvider>
              <DataProvider repository={repository} client={CLIENT_NAME} enrich={enrich} dismissalStorage={AsyncStorage} outboxStorage={outboxStorage}>
                <SessionProvider>
                  <Root fontsReady={fontsLoaded || Boolean(fontError)} />
                </SessionProvider>
              </DataProvider>
            </ToastProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ShareIntentProvider>
  );
}

const Root = ({ fontsReady }: { fontsReady: boolean }) => {
  const { session, ready } = useSession();
  const { palette } = useTheme();
  const loaded = ready && fontsReady;
  useOutboxSync(session?.user.id ?? null);
  useShareSheetReturn(loaded && isConfigured, Boolean(session));

  useEffect(() => {
    if (loaded) void SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;
  if (!isConfigured) return <SetupNeeded />;

  return (
    <>
      <StatusBar style={palette.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.canvas } }}>
        <Stack.Protected guard={Boolean(session)}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="link/[id]" />
          <Stack.Screen name="note/[id]" />
          <Stack.Screen name="space/[id]" />
          <Stack.Screen name="tasks" />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" options={{ animation: 'none' }} />
        {/* Signed in: an iOS page sheet over whatever was open (the Journal on a cold start). Signed out there's nothing to sit over, so a full screen. */}
        <Stack.Screen name="share" options={{ presentation: session ? 'modal' : 'card', contentStyle: { backgroundColor: palette.canvas } }} />
      </Stack>
    </>
  );
};

/**
 * The share sheet comes back when it should: when the extension hands over an
 * item while you're elsewhere in the app, and after signing in with a share
 * still waiting.
 */
const useShareSheetReturn = (active: boolean, signedIn: boolean) => {
  const router = useRouter();
  const pathname = usePathname();
  const { hasShareIntent } = useShareIntentContext();
  const waiting = useSyncExternalStore(shareDraft.subscribe, shareDraft.get);
  useEffect(() => {
    if (!active || pathname === '/share' || pathname === '/sign-in') return;
    if (hasShareIntent || (signedIn && waiting)) router.push('/share');
  }, [active, hasShareIntent, pathname, router, signedIn, waiting]);
};
