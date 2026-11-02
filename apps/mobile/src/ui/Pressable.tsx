import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable as RNPressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { DEPTH } from '@memex/core';
import { useTheme } from '../theme/theme';
import { Text } from './Text';

/*
 * Objects: things you press. Raised material (gradient + bevel), a settle on
 * press (0.97 over 80ms) and a soft spring back, a light haptic tick. Gloss
 * and a glow in its own colour mark the primary action only. Reduced motion
 * keeps the material change and drops the travel.
 */

type Variant = 'primary' | 'secondary' | 'ghost';

interface Props extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: Variant;
  icon?: ReactNode;
  loading?: boolean;
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

export const Button = ({ label, variant = 'secondary', icon, loading, disabled, style, onPress, ...rest }: Props) => {
  const t = useTheme();
  const { palette } = t;
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
          {
            backgroundColor: fill,
            borderRadius: t.radius.m,
            boxShadow: ghost ? undefined : primary ? `${t.objectShadow}, ${t.glow(palette.accent)}` : t.objectShadow,
            opacity: disabled && !loading ? 0.55 : 1,
          },
          settle.style,
        ]}
      >
        {!ghost && (
          <LinearGradient
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { borderRadius: t.radius.m }]}
            colors={
              primary
                ? ['#ffffff4d', '#ffffff24', '#ffffff00', '#0000000f']
                : palette.dark
                  ? ['#f9fafb1a', '#13171d1f']
                  : ['#ffffff1f', '#1d21270d']
            }
            locations={primary ? [0, 0.46, 0.54, 1] : [0, 1]}
          />
        )}
        <View style={styles.content}>
          {loading ? <ActivityIndicator size="small" color={primary ? palette.onAccent : palette.ink} /> : icon}
          <Text size="m" weight="heavy" tone={primary ? 'onAccent' : 'ink'}>
            {label}
          </Text>
        </View>
      </Animated.View>
    </RNPressable>
  );
};

const styles = StyleSheet.create({
  button: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 17 },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
