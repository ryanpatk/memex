import { type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTheme } from '../theme/theme';
import { usePressSettle } from './Pressable';

/** A round object (back, share, more): raised paper that settles when pressed. */
export const RoundButton = ({ label, onPress, icon }: { label: string; onPress: () => void; icon: (color: string) => ReactNode }) => {
  const t = useTheme();
  const settle = usePressSettle();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onPressIn={settle.onPressIn} onPressOut={settle.onPressOut} hitSlop={6}>
      <Animated.View style={[styles.round, { backgroundColor: t.palette.paper, boxShadow: t.objectShadow }, settle.style]}>
        {icon(t.palette.ink)}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
