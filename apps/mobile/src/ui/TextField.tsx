import { forwardRef, useState, type ComponentRef } from 'react';
import { StyleSheet, Text as RNText, TextInput, View, type TextInputProps } from 'react-native';
import { typeRole, useTheme } from '../theme/theme';
import { Text } from './Text';

interface Props extends TextInputProps {
  label: string;
  error?: string | null;
}

/** A labelled text field: a recessed well (pressed in), 16px text so iOS never zooms. */
export const TextField = forwardRef<ComponentRef<typeof TextInput>, Props>(function TextField({ label, error, style, onFocus, onBlur, ...rest }, ref) {
  const t = useTheme();
  const { palette } = t;
  const [focused, setFocused] = useState(false);
  const ring = error ? palette.error : focused ? palette.accent : 'transparent';
  if (t.cards) {
    // Memory Cards (s07, m07): a quiet label over a 64px well; a 4px ring on focus, red on error
    const c = t.cards;
    return (
      <View style={styles.cardsRoot}>
        <RNText style={[c.type.labelUi, { fontFamily: 'Inter_600SemiBold', fontSize: 17, color: c.colors.muted }]}>{label}</RNText>
        <TextInput
          ref={ref}
          {...rest}
          accessibilityLabel={label}
          placeholderTextColor={c.colors.faint}
          selectionColor={c.colors.primary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            c.type.body,
            styles.cardsInput,
            {
              color: c.colors.ink,
              backgroundColor: c.colors.well,
              boxShadow: error ? `0 0 0 3px ${c.colors.error}` : focused ? `0 0 0 4px ${c.colors.ring}` : undefined,
            },
            style,
          ]}
        />
        {error ? (
          <RNText style={[c.type.labelUi, { color: c.colors.error }]} accessibilityLiveRegion="polite">
            {error}
          </RNText>
        ) : null}
      </View>
    );
  }
  return (
    <View style={styles.root}>
      <Text size="xs" weight="heavy" tone="soft">
        {label}
      </Text>
      <TextInput
        ref={ref}
        {...rest}
        accessibilityLabel={label}
        placeholderTextColor={palette.faint}
        selectionColor={palette.accent}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          typeRole('m'),
          styles.input,
          {
            color: palette.ink,
            backgroundColor: palette.well,
            borderRadius: t.radius.m,
            boxShadow: palette.dark
              ? `inset 0 1px 2px 0 #13171d33, inset 0 -1px 0 0 #f9fafb1f, 0 0 0 2px ${ring}`
              : `inset 0 1px 2px 0 #1d212714, inset 0 -1px 0 0 #ffffff59, 0 0 0 2px ${ring}`,
          },
          style,
        ]}
      />
      {error ? (
        <Text size="xs" tone="error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  cardsRoot: { gap: 10 },
  cardsInput: { minHeight: 64, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 16, lineHeight: 24 },
  root: { gap: 6 },
  input: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 12 },
});
