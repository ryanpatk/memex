import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { Image } from 'expo-image';
import { accountAvatar, sizedAvatarUrl } from '@memex/core';
import { useSession } from '../auth/SessionProvider';
import { FIXTURE_MODE } from '../data/config';
import { useRepository } from '../data/DataProvider';
import { AccountSheet } from '../cards/AccountSheet';
import { useCards } from '../cards/useCards';
import { useToast } from './Toast';

/**
 * The GitHub picture filling a disc of `size`, or `letter` when the session
 * has none or it fails to load.
 */
const AvatarFace = ({ url, alt, size, letter }: { url: string | null; alt: string; size: number; letter: ReactNode }) => {
  const [failed, setFailed] = useState<string | null>(null);
  if (!url || failed === url) return <>{letter}</>;
  return (
    <Image
      source={sizedAvatarUrl(url, size * 3)}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
      accessibilityLabel={alt}
      accessibilityIgnoresInvertColors
      onError={() => setFailed(url)}
    />
  );
};

/**
 * The signed-in account as a molded disc (the GitHub picture when there is
 * one); pressing it opens the account sheet (m07) with Sign out. Sign-out
 * ends the session on the server too, so offline it fails and you stay
 * signed in; the toast says so.
 */
export const AccountButton = () => {
  const c = useCards();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { session } = useSession();
  const repository = useRepository();
  const toast = useToast();
  const email = session?.user.email ?? '';
  const { url: avatarUrl, initial: letter, alt: avatarAlt } = accountAvatar(session?.user);

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

  return (
    <>
      <Pressable onPress={() => setSheetOpen(true)} accessibilityRole="button" accessibilityLabel={`Account, ${email}`} hitSlop={6}>
        {({ pressed }) => (
          <View
            style={[
              styles.disc,
              {
                backgroundColor: c.colors.paper,
                boxShadow: pressed
                  ? `inset 0 3px 0 0 #0000001a, inset 0 0 0 2px ${c.colors.line}`
                  : `inset 0 0 0 2px ${c.colors.line}, inset 0 -4px 0 0 ${c.colors.line}`,
                transform: pressed ? [{ scale: 0.94 }] : undefined,
              },
            ]}
          >
            <AvatarFace url={avatarUrl} alt={avatarAlt} size={44} letter={<RNText style={[c.type.title, { color: c.colors.ink }]}>{letter}</RNText>} />
            {avatarUrl ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.ring, { borderColor: c.colors.line }]} /> : null}
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
};

const styles = StyleSheet.create({
  disc: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  ring: { borderRadius: 22, borderWidth: 2 },
});
