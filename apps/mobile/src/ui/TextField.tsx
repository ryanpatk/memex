import { forwardRef, useState, type ComponentRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
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
  root: { gap: 6 },
  input: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 12 },
});
