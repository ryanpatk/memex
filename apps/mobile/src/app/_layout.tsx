import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { Nunito_900Black } from '@expo-google-fonts/nunito';
import { SessionProvider, useSession } from '../auth/SessionProvider';
import { isConfigured } from '../data/config';
import { queryClient } from '../data/queryClient';
import { ThemeProvider, useTheme } from '../theme/theme';
import { SetupNeeded } from '../ui/SetupNeeded';

void SplashScreen.preventAutoHideAsync();

/** Providers, fonts, and the signed-in / signed-out split (Stack.Protected). */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Nunito_900Black });
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <Root fontsReady={fontsLoaded || Boolean(fontError)} />
          </SessionProvider>
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
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" options={{ animation: 'none' }} />
      </Stack>
    </>
  );
};
