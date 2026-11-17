import { type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTheme } from '../theme/theme';
import { usePressSettle } from './Pressable';

/** A round object (back, share, more): raised paper that settles when pressed (Memory Cards: a 44px molded disc). */
export const RoundButton = ({ label, onPress, icon }: { label: string; onPress: () => void; icon: (color: string) => ReactNode }) => {
  const t = useTheme();
  const settle = usePressSettle();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onPressIn={settle.onPressIn} onPressOut={settle.onPressOut} hitSlop={6}>
      <Animated.View
        style={[
          styles.round,
          t.cards
            ? { width: 44, height: 44, borderRadius: 22, backgroundColor: t.cards.colors.paper, boxShadow: `inset 0 0 0 2px ${t.cards.colors.line}, inset 0 -4px 0 0 ${t.cards.colors.line}` }
            : { backgroundColor: t.palette.paper, boxShadow: t.objectShadow },
          settle.style,
        ]}
      >
        {icon(t.palette.ink)}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
