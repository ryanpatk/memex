import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { Nunito_900Black } from '@expo-google-fonts/nunito';
import { SessionProvider, useSession } from '../auth/SessionProvider';
import { CLIENT_NAME } from '../data/client';
import { FIXTURE_MODE, isConfigured } from '../data/config';
import { DataProvider } from '../data/DataProvider';
import { queryClient } from '../data/queryClient';
import { repository } from '../data/repository';
import { scrapeLink, scraperEnabled } from '../data/scraper';
import { ThemeProvider, useTheme } from '../theme/theme';
import { SetupNeeded } from '../ui/SetupNeeded';
import { ToastProvider } from '../ui/Toast';

// Link metadata from the scraper Worker; demo data stays offline.
const enrich = scraperEnabled && FIXTURE_MODE === 'off' ? scrapeLink : undefined;

void SplashScreen.preventAutoHideAsync();

/** Providers, fonts, and the signed-in / signed-out split (Stack.Protected). */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Nunito_900Black });
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <DataProvider repository={repository} client={CLIENT_NAME} enrich={enrich} dismissalStorage={AsyncStorage}>
              <SessionProvider>
                <Root fontsReady={fontsLoaded || Boolean(fontError)} />
              </SessionProvider>
            </DataProvider>
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const Root = ({ fontsReady }: { fontsReady: boolean }) => {
  const { session, ready } = useSession();
  const { palette } = useTheme();
  const loaded = ready && fontsReady;

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
      </Stack>
    </>
  );
};
