import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isTransientError } from '@memex/core';
import Svg, { Path } from 'react-native-svg';
import { signInWithGitHub } from '../auth/signInWithGitHub';
import { repository } from '../data/repository';
import { useTheme } from '../theme/theme';
import { Button } from '../ui/Pressable';
import { Canvas } from '../ui/Canvas';
import { Paper } from '../ui/Paper';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { Wordmark } from '../ui/Wordmark';

/*
 * Sign in the way the web app does: email + password, or GitHub (OAuth with
 * PKCE in an auth browser session). Accounts are made on the web; memex is
 * single-user.
 */

const GitHubMark = ({ color }: { color: string }) => (
  <Svg width={18} height={18} viewBox="0 0 16 16" accessibilityElementsHidden importantForAccessibility="no">
    <Path
      fill={color}
      d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
    />
  </Svg>
);

/** A sign-in that threw (rather than answering with an error): usually no connection. */
const thrown = (e: unknown) => {
  console.warn('Sign-in failed:', e);
  return isTransientError(e) ? 'Couldn’t reach memex. Check your connection and try again.' : 'Couldn’t sign in. Try again.';
};

/** `/sign-in?error=callback`: the GitHub redirect came back but its code exchange failed (auth/callback). */
const PARAM_ERRORS: Record<string, string> = {
  callback: 'GitHub sign-in didn’t finish. Try again.',
};

export default function SignIn() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'password' | 'github' | null>(null);
  const params = useLocalSearchParams<{ error?: string }>();
  const [error, setError] = useState<string | null>((params.error && PARAM_ERRORS[params.error]) || null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  const submit = async () => {
    const trimmed = email.trim();
    const errors = {
      email: trimmed ? undefined : 'Enter your email',
      password: password ? undefined : 'Enter your password',
    };
    setFieldErrors(errors);
    setError(null);
    if (errors.email || errors.password) return;
    setBusy('password');
    try {
      const { error: authError } = await repository.auth.signInWithPassword({ email: trimmed, password });
      if (authError) setError(authError.message);
    } catch (e) {
      setError(thrown(e));
    } finally {
      setBusy(null);
    }
  };

  const github = async () => {
    setError(null);
    setBusy('github');
    try {
      const { error: authError } = await signInWithGitHub();
      if (authError) setError(authError);
    } catch (e) {
      setError(thrown(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Canvas>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 25 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <Wordmark size={44} />
            <Text size="m" tone="muted" style={styles.center}>
              Your working memory, in your pocket.
            </Text>
          </View>

          <Paper level="m" radius={19} style={styles.card}>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              error={fieldErrors.email}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="email"
              textContentType="username"
              keyboardType="email-address"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              submitBehavior="submit"
            />
            <TextField
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={setPassword}
              error={fieldErrors.password}
              placeholder="Your password"
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={submit}
            />
            {error ? (
              <Text size="s" tone="error" accessibilityLiveRegion="polite" accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            <Button label="Sign in" variant="primary" loading={busy === 'password'} disabled={busy !== null} onPress={submit} />
            <View style={styles.or}>
              <View style={[styles.rule, { backgroundColor: palette.hairline }]} />
              <Text size="xs" tone="faint">
                or
              </Text>
              <View style={[styles.rule, { backgroundColor: palette.hairline }]} />
            </View>
            <Button
              label="Continue with GitHub"
              icon={<GitHubMark color={palette.ink} />}
              loading={busy === 'github'}
              disabled={busy !== null}
              onPress={github}
            />
          </Paper>

          <Text size="xs" tone="faint" style={styles.center}>
            New to memex? Create your account on the web first.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 17, gap: 25 },
  brand: { alignItems: 'center', gap: 4 },
  card: { padding: 17, gap: 17 },
  or: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  center: { textAlign: 'center' },
});
