import { StyleSheet, View } from 'react-native';
import type { JournalSpace } from '@memex/core';
import { alpha, mix } from '../theme/palette';
import { useTheme } from '../theme/theme';
import { Text } from './Text';

/** A space an entry is filed in: its own hue as a dot and a light tint (web: .jr-chip). */
export const SpaceChip = ({ space }: { space: JournalSpace }) => {
  const { palette } = useTheme();
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
});
