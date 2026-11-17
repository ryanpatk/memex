import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/theme';

/**
 * The toggle group (s12; m03 Space · Date, m05 Jot · Note · Task): a well
 * with the chosen segment lifted out of it as paper.
 */
export const Segmented = <T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** What the control chooses, for VoiceOver. */
  label: string;
  /** `a11y`: what VoiceOver says when the label alone is too short (“By due date”). */
  options: { value: T; label: string; a11y?: string }[];
  value: T;
  onChange: (value: T) => void;
}) => {
  const { cards: c, palette } = useTheme();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={[styles.well, { backgroundColor: c.colors.well }]}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={option.a11y ?? option.label}
            onPress={() => {
              if (on) return;
              void Haptics.selectionAsync();
              onChange(option.value);
            }}
            style={[styles.segment, on && { backgroundColor: c.colors.paper, boxShadow: `inset 0 2px 0 0 ${palette.lit}, ${c.softShadow}` }]}
          >
            <RNText style={[c.type.title, styles.text, { color: on ? c.colors.ink : c.colors.muted }]} numberOfLines={1}>
              {option.label}
            </RNText>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  well: { flexDirection: 'row', alignSelf: 'flex-start', height: 56, borderRadius: 28, padding: 4, gap: 4 },
  segment: { minHeight: 48, minWidth: 64, borderRadius: 24, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 17 },
});
