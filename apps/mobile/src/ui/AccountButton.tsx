import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSession } from '../auth/SessionProvider';
import { FIXTURE_MODE } from '../data/config';
import { repository } from '../data/repository';
import { useTheme } from '../theme/theme';
import { usePressSettle } from './Pressable';
import { Text } from './Text';

/** The signed-in account as a small raised disc; pressing it offers Sign out. */
export const AccountButton = () => {
  const t = useTheme();
  const { session } = useSession();
  const settle = usePressSettle();
  const email = session?.user.email ?? '';
  const name = session?.user.user_metadata.full_name ?? session?.user.user_metadata.name ?? email;
  const letter = (name || '?').trim().charAt(0).toUpperCase();

  const open = () =>
    Alert.alert(FIXTURE_MODE !== 'off' ? `${email} (demo data)` : email || 'Signed in', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void repository.auth.signOut() },
    ]);

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
});
