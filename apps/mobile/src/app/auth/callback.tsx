import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSession } from '../../auth/SessionProvider';
import { repository } from '../../data/repository';
import { useTheme } from '../../theme/theme';
import { Canvas } from '../../ui/Canvas';

/*
 * memex://auth/callback. The auth browser session normally hands the redirect
 * straight back to signInWithGitHub; this route covers the app being opened
 * by the link itself (e.g. after a cold start) and then moves on.
 */
export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const { session } = useSession();
  const router = useRouter();
  const { palette } = useTheme();

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (!done) router.replace('/');
      done = true;
    };
    if (session || !code) return finish();
    repository.auth.exchangeCodeForSession(code).finally(finish);
  }, [code, router, session]);

  return (
    <Canvas style={styles.center}>
      <ActivityIndicator color={palette.muted} accessibilityLabel="Signing in…" />
    </Canvas>
  );
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
