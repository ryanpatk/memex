import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSession } from '../auth/SessionProvider';
import { FIXTURE_MODE } from '../data/config';
import { useRepository } from '../data/DataProvider';
import { useLook, useTheme } from '../theme/theme';
import { AccountSheet } from '../cards/AccountSheet';
import { usePressSettle } from './Pressable';
import { Text } from './Text';
import { useToast } from './Toast';

/**
 * The signed-in account as a small raised disc; pressing it offers Sign out.
 * Sign-out ends the session on the server too, so offline it fails and you
 * stay signed in; the toast says so.
 */
export const AccountButton = () => {
  const t = useTheme();
  const { setLook } = useLook();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { session } = useSession();
  const settle = usePressSettle();
  const repository = useRepository();
  const toast = useToast();
  const email = session?.user.email ?? '';
  const name = session?.user.user_metadata.full_name ?? session?.user.user_metadata.name ?? email;
  const letter = (name || '?').trim().charAt(0).toUpperCase();

  const signOut = async () => {
    const failed = await repository.auth.signOut().then(
      ({ error }) => error,
      (e: unknown) => e,
    );
    if (failed) {
      console.warn('Sign-out failed:', failed);
      toast.show('Couldn’t sign out. Check your connection.', { tone: 'error' });
    }
  };

  const who = FIXTURE_MODE !== 'off' ? `${email} (demo data)` : email || 'Signed in';
  const open = () =>
    t.cards
      ? setSheetOpen(true)
      : Alert.alert(who, undefined, [
          { text: 'Cancel', style: 'cancel' },
          // The Memory Cards look, behind its flag (theme/look.ts); remembered on this phone.
          // Dev builds only, so a release build's account menu stays exactly as it was.
          ...(__DEV__ ? [{ text: 'Try the new look', onPress: () => setLook('cards') }] : []),
          { text: 'Sign out', style: 'destructive' as const, onPress: () => void signOut() },
        ]);

  if (t.cards) {
    const c = t.cards;
    return (
      <>
        <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`Account, ${email}`} hitSlop={6}>
          {({ pressed }) => (
            <View
              style={[
                styles.cardsDisc,
                {
                  backgroundColor: c.colors.paper,
                  boxShadow: pressed
                    ? `inset 0 3px 0 0 #0000001a, inset 0 0 0 2px ${c.colors.line}`
                    : `inset 0 0 0 2px ${c.colors.line}, inset 0 -4px 0 0 ${c.colors.line}`,
                  transform: pressed ? [{ scale: 0.94 }] : undefined,
                },
              ]}
            >
              <RNText style={[c.type.title, { color: c.colors.ink }]}>{letter}</RNText>
            </View>
          )}
        </Pressable>
        <AccountSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          email={who}
          onSignOut={() => {
            setSheetOpen(false);
            void signOut();
          }}
        />
      </>
    );
  }

  return (
    <Pressable
      onPress={open}
      onPressIn={settle.onPressIn}
      onPressOut={settle.onPressOut}
      accessibilityRole="button"
      accessibilityLabel={`Account, ${email}`}
      hitSlop={6}
    >
      <Animated.View style={[styles.disc, { backgroundColor: t.palette.tint, boxShadow: t.objectShadow }, settle.style]}>
        <View>
          <Text size="s" weight="heavy" style={{ color: t.palette.tintInk }}>
            {letter}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  disc: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  cardsDisc: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
