import { StyleSheet, View } from 'react-native';
import type { JournalSpace } from '@memex/core';
import { useTheme } from '../theme/theme';
import { Text } from './Text';

/** A space an entry is filed in (d23): a molded strip filled with the space's colour, a light dot leading. */
export const SpaceChip = ({ space }: { space: JournalSpace }) => {
  const { cards } = useTheme();
  return (
    <View style={[styles.strip, { backgroundColor: space.color, boxShadow: 'inset 0 -5px 0 0 #00000029' }]}>
      <View style={styles.dot} />
      <Text size="s" weight="heavy" numberOfLines={1} style={[styles.label, { color: cards.colors.onColor }]}>
        {space.name}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  label: { flexShrink: 1 },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, borderRadius: 20, paddingLeft: 8, paddingRight: 16, maxWidth: 260 },
  dot: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#ffffff8c' },
});
