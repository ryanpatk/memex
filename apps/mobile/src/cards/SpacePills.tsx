import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCards } from './useCards';

/*
 * The space pill row (s03, m01): “All” then each space as a round cartridge
 * pill with its colour dot; the chosen pill fills with its colour. The row
 * scrolls sideways and fades at the right edge. Counts (Tasks' filter) ride
 * along after the name; `extra` pills (Unfiled) come last, without a dot.
 */

export interface PillSpace {
  id: string;
  name: string;
  color: string;
}

const countFmt = new Intl.NumberFormat();

export const SpacePills = ({
  spaces,
  selected,
  onSelect,
  allCount,
  counts,
  extra = [],
  label = 'Spaces',
}: {
  spaces: PillSpace[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** A count on “All”. */
  allCount?: number;
  /** A count per space id (and per `extra` id). */
  counts?: ReadonlyMap<string, number>;
  /** Pills after the spaces, e.g. Unfiled. */
  extra?: { id: string; name: string }[];
  /** What the row chooses, for VoiceOver. */
  label?: string;
}) => {
  const c = useCards();
  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        accessibilityRole="tablist"
        accessibilityLabel={label}
        keyboardShouldPersistTaps="handled"
      >
        <Pill label="All" count={allCount} on={selected === null} onPress={() => onSelect(null)} />
        {spaces.map((space) => (
          <Pill
            key={space.id}
            label={space.name}
            color={space.color}
            count={counts?.get(space.id)}
            selected={selected === space.id}
            onPress={() => onSelect(selected === space.id ? null : space.id)}
          />
        ))}
        {extra.map((item) => (
          <Pill
            key={item.id}
            label={item.name}
            count={counts?.get(item.id)}
            on={selected === item.id}
            onPress={() => onSelect(selected === item.id ? null : item.id)}
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
  count,
  on = false,
  selected = false,
  onPress,
}: {
  label: string;
  color?: string;
  count?: number;
  on?: boolean;
  selected?: boolean;
  onPress: () => void;
}) => {
  const c = useCards();
  const bg = on ? c.colors.ink : selected && color ? color : c.colors.paper;
  const ink = on ? c.colors.paper : selected ? c.colors.onColor : c.colors.ink;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: on || selected }}
      accessibilityLabel={count === undefined ? label : `${label}, ${countFmt.format(count)}`}
    >
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
          <RNText style={[c.type.title, styles.name, { fontSize: 18, color: ink }]} numberOfLines={1}>
            {label}
          </RNText>
          {count !== undefined ? (
            <RNText style={[c.type.labelUi, { color: on ? c.colors.faint : selected ? c.colors.onColor : c.colors.muted, opacity: selected ? 0.7 : 1, fontVariant: ['tabular-nums'] }]}>
              {countFmt.format(count)}
            </RNText>
          ) : null}
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: { gap: 10, paddingHorizontal: 20, paddingVertical: 6 },
  pill: { height: 48, borderRadius: 9999, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 18, maxWidth: 260 },
  dot: { width: 32, height: 32, borderRadius: 16 },
  name: { flexShrink: 1 },
  fade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 48 },
});
