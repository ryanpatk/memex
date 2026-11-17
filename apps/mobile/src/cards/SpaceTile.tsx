import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { useCards } from './useCards';

const countFmt = new Intl.NumberFormat();

/*
 * A space as a colour tile (x03, m02): the count big, the name at the
 * bottom, ink on the space's colour, molded. `wide` + ink is the Tasks tile.
 */
export const SpaceTile = ({
  name,
  count,
  color,
  onPress,
  wide = false,
  accessibilityLabel,
}: {
  name: string;
  count: number;
  color?: string;
  onPress: () => void;
  wide?: boolean;
  accessibilityLabel?: string;
}) => {
  const c = useCards();
  const ink = !color;
  const bg = color ?? c.colors.ink;
  const fg = ink ? c.colors.paper : c.colors.onColor;
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={accessibilityLabel ?? `${name}, ${count}`} style={wide ? styles.wideCell : styles.cell}>
      {({ pressed }) => (
        <View
          style={[
            wide ? styles.wide : styles.tile,
            {
              backgroundColor: bg,
              borderRadius: c.radius.card,
              boxShadow: `${c.molded(pressed)}, ${c.softShadow}`,
              transform: pressed ? [{ scale: 0.97 }] : undefined,
            },
          ]}
        >
          {wide ? (
            <>
              <RNText style={[c.type.title, { color: fg }]}>{name}</RNText>
              <RNText style={[c.type.h1, { color: fg, fontVariant: ['tabular-nums'] }]}>{countFmt.format(count)}</RNText>
            </>
          ) : (
            <>
              <RNText style={[c.type.hero, { fontSize: 48, lineHeight: 50, color: fg, fontVariant: ['tabular-nums'] }]}>{countFmt.format(count)}</RNText>
              <RNText style={[c.type.title, { color: fg }]} numberOfLines={2}>
                {name}
              </RNText>
            </>
          )}
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  cell: { width: '48%', flexGrow: 1 },
  wideCell: { width: '100%' },
  tile: { minHeight: 152, padding: 22, justifyContent: 'space-between' },
  wide: { minHeight: 100, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
