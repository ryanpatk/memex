import { type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTheme } from '../theme/theme';
import { usePressSettle } from './Pressable';

/** A round object (back, share, more): a 44px molded paper disc that settles when pressed. */
export const RoundButton = ({ label, onPress, icon }: { label: string; onPress: () => void; icon: (color: string) => ReactNode }) => {
  const { cards, palette } = useTheme();
  const settle = usePressSettle();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onPressIn={settle.onPressIn} onPressOut={settle.onPressOut} hitSlop={6}>
      <Animated.View
        style={[
          styles.round,
          { backgroundColor: cards.colors.paper, boxShadow: `inset 0 0 0 2px ${cards.colors.line}, inset 0 -4px 0 0 ${cards.colors.line}` },
          settle.style,
        ]}
      >
        {icon(palette.ink)}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
