import { StyleSheet, View } from 'react-native';
import type { JournalSpace } from '@memex/core';
import { alpha, mix } from '../theme/palette';
import { useTheme } from '../theme/theme';
import { Text } from './Text';

/**
 * A space an entry is filed in: its own hue as a dot and a light tint (web:
 * .jr-chip). In the Memory Cards look it is a molded strip filled with the
 * space's colour (d23).
 */
export const SpaceChip = ({ space }: { space: JournalSpace }) => {
  const { palette, cards } = useTheme();
  if (cards) {
    return (
      <View style={[styles.strip, { backgroundColor: space.color, boxShadow: 'inset 0 -5px 0 0 #00000029' }]}>
        <View style={styles.stripDot} />
        <Text size="s" weight="heavy" numberOfLines={1} style={[styles.label, { color: cards.colors.onColor }]}>
          {space.name}
        </Text>
      </View>
    );
  }
  const bg = mix(space.color, palette.paper, palette.dark ? 0.2 : 0.12);
  return (
    <View style={[styles.chip, { backgroundColor: bg, boxShadow: `0 0 0 1px ${alpha(space.color, 0.22)}` }]}>
      <View style={[styles.dot, { backgroundColor: space.color }]} />
      <Text size="xs" weight="medium" tone="soft" numberOfLines={1} style={styles.label}>
        {space.name}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9999, maxWidth: 180 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { flexShrink: 1 },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, borderRadius: 20, paddingLeft: 8, paddingRight: 16, maxWidth: 260 },
  stripDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#ffffff8c' },
});
