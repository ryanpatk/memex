import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { CloudOff } from 'lucide-react-native';
import { ThemeProvider, useTheme } from '../theme/theme';
import { Canvas } from './Canvas';
import { Placeholder } from './Placeholder';
import { Button } from './Pressable';

/*
 * The root ErrorBoundary (exported from app/_layout.tsx, Expo Router's
 * convention). It renders in place of the root layout, so outside every
 * provider the layout sets up: it brings its own theme and needs nothing
 * else (no session, data or toasts). It hides the splash screen in case the
 * error came before the app was ready.
 */

const Body = ({ retry }: { retry: () => void }) => {
  const { palette } = useTheme();
  return (
    <Canvas>
      <View style={styles.center}>
        <Placeholder
          icon={<CloudOff size={26} color={palette.onAccent} strokeWidth={2} />}
          title="Something went wrong"
          body="memex hit a problem showing this screen. Try again; if it keeps happening, close the app and open it again."
        >
          <Button label="Try again" variant="primary" onPress={retry} />
        </Placeholder>
      </View>
    </Canvas>
  );
};

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    console.warn('memex crashed while rendering:', error);
    SplashScreen.hideAsync().catch(() => {});
  }, [error]);
  return (
    <ThemeProvider>
      <Body retry={() => void retry().catch(() => {})} />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({ center: { flex: 1, justifyContent: 'center' } });
