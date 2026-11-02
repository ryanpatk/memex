import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/theme';
import { Text } from './Text';

/**
 * A segmented control (web: the Tasks header's By space / By date): a well
 * with the chosen segment raised out of it as an object.
 */
export const Segmented = <T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** What the control chooses, for VoiceOver. */
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) => {
  const t = useTheme();
  const { palette } = t;
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={[styles.well, { backgroundColor: palette.well, borderRadius: t.radius.m }]}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={option.label}
            onPress={() => {
              if (on) return;
              void Haptics.selectionAsync();
              onChange(option.value);
            }}
            style={[
              styles.segment,
              { borderRadius: t.radius.m - 3 },
              on && { backgroundColor: palette.paper, boxShadow: t.objectShadow },
            ]}
          >
            <Text size="xs" weight="heavy" tone={on ? 'ink' : 'muted'} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  well: { flexDirection: 'row', padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
});
