import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text as RNText, View, type StyleProp, type ViewStyle } from 'react-native';
import { useCards } from './useCards';

/*
 * Molded controls (s02): a lit top edge and a darker lip that flattens when
 * pressed. RoundButton is the 44px circle (⌕, account, ←, •••); MoldedButton
 * the 56px pill (primary blue, or paper with a line ring; quiet is flat).
 */

export const CardsRoundButton = ({
  onPress,
  label,
  children,
  size = 44,
  primary = false,
}: {
  onPress: () => void;
  label: string;
  children: ReactNode;
  size?: number;
  primary?: boolean;
}) => {
  const c = useCards();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
      {({ pressed }) => (
        <View
          style={[
            styles.round,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: primary ? c.colors.primary : c.colors.paper,
              boxShadow: primary
                ? c.molded(pressed)
                : pressed
                  ? `inset 0 3px 0 0 #0000001a, inset 0 0 0 2px ${c.colors.line}`
                  : `inset 0 0 0 2px ${c.colors.line}, inset 0 -4px 0 0 ${c.colors.line}`,
              transform: pressed ? [{ scale: 0.94 }] : undefined,
            },
          ]}
        >
          {children}
        </View>
      )}
    </Pressable>
  );
};

export const MoldedButton = ({
  label,
  onPress,
  variant = 'secondary',
  wide = false,
  style,
  accessibilityLabel,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'quiet';
  wide?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  disabled?: boolean;
  testID?: string;
}) => {
  const c = useCards();
  const primary = variant === 'primary';
  const quiet = variant === 'quiet';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={[wide && styles.wide, style]}
      testID={testID}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.pill,
            {
              height: 56,
              backgroundColor: primary ? c.colors.primary : quiet ? (pressed ? c.colors.well : 'transparent') : c.colors.paper,
              boxShadow: quiet
                ? undefined
                : primary
                  ? c.molded(pressed)
                  : pressed
                    ? `inset 0 3px 0 0 #0000001a, inset 0 0 0 2px ${c.colors.line}`
                    : `inset 0 0 0 2px ${c.colors.line}, inset 0 -4px 0 0 ${c.colors.line}`,
              transform: pressed && !quiet ? [{ translateY: 2 }, { scale: 0.97 }] : undefined,
              opacity: disabled ? 0.38 : 1,
            },
          ]}
        >
          <RNText style={[c.type.title, { fontSize: 19, color: primary ? '#ffffff' : quiet ? c.colors.muted : c.colors.ink }]} numberOfLines={1}>
            {label}
          </RNText>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  round: { alignItems: 'center', justifyContent: 'center' },
  pill: { borderRadius: 9999, paddingHorizontal: 28, alignItems: 'center', justifyContent: 'center' },
  wide: { flexGrow: 1 },
});
