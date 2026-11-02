import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';

/** A tab's heading: large title, a quiet line under it, an optional trailing control. */
export const ScreenHeader = ({ title, subtitle, trailing }: { title: string; subtitle?: string; trailing?: ReactNode }) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.text}>
        <Text size="l" weight="heavy" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text size="xs" weight="medium" tone="muted" numeric numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 17, paddingBottom: 12 },
  text: { flex: 1, minWidth: 0, gap: 2 },
});
