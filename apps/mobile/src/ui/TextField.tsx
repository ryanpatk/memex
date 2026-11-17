import { forwardRef, useState, type ComponentRef } from 'react';
import { StyleSheet, Text as RNText, TextInput, View, type TextInputProps } from 'react-native';
import { useCards } from '../cards/useCards';

interface Props extends TextInputProps {
  label: string;
  error?: string | null;
}

/** A labelled text field (s07, m07): a quiet label over a 64px well; a 4px ring on focus, red on error. 18px text, so iOS never zooms. */
export const TextField = forwardRef<ComponentRef<typeof TextInput>, Props>(function TextField({ label, error, style, onFocus, onBlur, ...rest }, ref) {
  const c = useCards();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.root}>
      <RNText style={[c.type.labelUi, styles.label, { color: c.colors.muted }]}>{label}</RNText>
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
          styles.input,
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
});

const styles = StyleSheet.create({
  root: { gap: 10 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 17 },
  input: { minHeight: 64, borderRadius: 20, paddingHorizontal: 20, paddingVertical: 16, lineHeight: 24 },
});
