import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCards } from './useCards';

/*
 * The space pill row (s03, m01): “All” then each space as a round cartridge
 * pill with its colour dot; the chosen pill fills with its colour. The row
 * scrolls sideways and fades at the right edge.
 */

export interface PillSpace {
  id: string;
  name: string;
  color: string;
}

export const SpacePills = ({
  spaces,
  selected,
  onSelect,
}: {
  spaces: PillSpace[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) => {
  const c = useCards();
  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityRole="tablist">
        <Pill label="All" on={selected === null} onPress={() => onSelect(null)} />
        {spaces.map((space) => (
          <Pill
            key={space.id}
            label={space.name}
            color={space.color}
            selected={selected === space.id}
            onPress={() => onSelect(selected === space.id ? null : space.id)}
          />
        ))}
      </ScrollView>
      <LinearGradient
        colors={[`${c.colors.bg}00`, c.colors.bg]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.fade}
        pointerEvents="none"
      />
    </View>
  );
};

const Pill = ({
  label,
  color,
  on = false,
  selected = false,
  onPress,
}: {
  label: string;
  color?: string;
  on?: boolean;
  selected?: boolean;
  onPress: () => void;
}) => {
  const c = useCards();
  const bg = on ? c.colors.ink : selected && color ? color : c.colors.paper;
  const ink = on ? c.colors.paper : selected ? c.colors.onColor : c.colors.ink;
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on || selected }} accessibilityLabel={label}>
      {({ pressed }) => (
        <View
          style={[
            styles.pill,
            {
              backgroundColor: bg,
              paddingLeft: color ? 8 : 18,
              boxShadow: selected ? c.molded(pressed) : `inset 0 2px 0 0 #ffffffcc, ${c.softShadow}`,
              transform: pressed ? [{ scale: 0.96 }] : undefined,
            },
          ]}
        >
          {color ? (
            <View
              style={[
                styles.dot,
                { backgroundColor: selected ? c.colors.paper : color, boxShadow: selected ? undefined : 'inset 0 -3px 0 0 #00000024, inset 0 2px 0 0 #ffffff59' },
              ]}
            />
          ) : null}
          <RNText style={[c.type.title, { fontSize: 18, color: ink }]} numberOfLines={1}>
            {label}
          </RNText>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: { gap: 10, paddingHorizontal: 20, paddingVertical: 6 },
  pill: { height: 48, borderRadius: 9999, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 18, maxWidth: 240 },
  dot: { width: 32, height: 32, borderRadius: 16 },
  fade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 48 },
});
