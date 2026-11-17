import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable as RNPressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { DEPTH } from '@memex/core';
import { useTheme } from '../theme/theme';
import { Text } from './Text';

/*
 * Objects: things you press (Memory Cards s02). A molded pill (primary
 * blue with a darker lip; secondary paper with a line ring; ghost flat and
 * quiet), a settle on press (0.97 over 80ms) and a soft spring back, a light
 * haptic tick. Reduced motion keeps the press and drops the travel.
 */

type Variant = 'primary' | 'secondary' | 'ghost';

interface Props extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: Variant;
  icon?: ReactNode;
  loading?: boolean;
  /** Smaller, for headers and inline actions. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const usePressSettle = () => {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return {
    style,
    onPressIn: () => {
      if (!reduced) scale.set(withTiming(DEPTH.pressSettle, { duration: 80 }));
    },
    onPressOut: () => {
      if (!reduced) scale.set(withSpring(1, { damping: 14, stiffness: 320, mass: 0.6 }));
    },
  };
};

export const Button = ({ label, variant = 'secondary', icon, loading, compact, disabled, style, onPress, ...rest }: Props) => {
  const { palette, cards } = useTheme();
  const settle = usePressSettle();
  const primary = variant === 'primary';
  const ghost = variant === 'ghost';
  const fill = primary ? palette.accent : ghost ? 'transparent' : palette.paper;
  const inactive = disabled || loading;

  return (
    <RNPressable
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPressIn={settle.onPressIn}
      onPressOut={settle.onPressOut}
      onPress={(e) => {
        void Haptics.impactAsync(primary ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
        onPress?.(e);
      }}
      style={style}
    >
      <Animated.View
        style={[
          styles.button,
          compact && styles.compact,
          {
            // Memory Cards (s02): molded pills, a lit edge and a lip; secondary is paper with a line ring
            backgroundColor: fill,
            borderRadius: 9999,
            minHeight: compact ? 48 : 56,
            paddingHorizontal: compact ? 20 : 28,
            boxShadow: ghost
              ? undefined
              : primary
                ? cards.molded()
                : `inset 0 0 0 2px ${cards.colors.line}, inset 0 -4px 0 0 ${cards.colors.line}`,
            opacity: disabled && !loading ? 0.38 : 1,
          },
          settle.style,
        ]}
      >
        <View style={[styles.content, compact && styles.compactContent]}>
          {loading ? <ActivityIndicator size="small" color={primary ? palette.onAccent : palette.ink} /> : icon}
          <Text size={compact ? 's' : 'm'} weight="heavy" tone={primary ? 'onAccent' : ghost ? 'muted' : 'ink'}>
            {label}
          </Text>
        </View>
      </Animated.View>
    </RNPressable>
  );
};

const styles = StyleSheet.create({
  button: { justifyContent: 'center' },
  compact: {},
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  compactContent: { gap: 6 },
});
