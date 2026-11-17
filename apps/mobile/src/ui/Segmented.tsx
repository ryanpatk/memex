import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
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
  /** `a11y`: what VoiceOver says when the label alone is too short (“By due date”). */
  options: { value: T; label: string; a11y?: string }[];
  value: T;
  onChange: (value: T) => void;
}) => {
  const t = useTheme();
  const { palette } = t;
  if (t.cards) {
    // Memory Cards (s12 toggle group, m03, m05): a well with the chosen segment lifted out as paper
    const c = t.cards;
    return (
      <View accessibilityRole="tablist" accessibilityLabel={label} style={[styles.cardsWell, { backgroundColor: c.colors.well }]}>
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
              style={[styles.cardsSegment, on && { backgroundColor: c.colors.paper, boxShadow: `inset 0 2px 0 0 ${t.palette.lit}, ${c.softShadow}` }]}
            >
              <RNText style={[c.type.title, { fontSize: 17, color: on ? c.colors.ink : c.colors.muted }]} numberOfLines={1}>
                {option.label}
              </RNText>
            </Pressable>
          );
        })}
      </View>
    );
  }
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
  cardsWell: { flexDirection: 'row', alignSelf: 'flex-start', height: 56, borderRadius: 28, padding: 4, gap: 4 },
  cardsSegment: { minHeight: 48, minWidth: 64, borderRadius: 24, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  well: { flexDirection: 'row', padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
});
