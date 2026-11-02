import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { RoundButton } from './RoundButton';
import { Text } from './Text';

/**
 * A pushed screen's heading: Back on the left, optional controls on the
 * right, then the large title (with an optional lead, e.g. a space's dot)
 * and a quiet line under it. Back falls back to the Journal for deep links.
 */
export const StackHeader = ({
  title,
  subtitle,
  lead,
  trailing,
  onBack,
}: {
  title?: string;
  subtitle?: string;
  lead?: ReactNode;
  trailing?: ReactNode;
  /** Replaces the default (e.g. to ask before dropping unsaved changes). */
  onBack?: () => void;
}) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <View style={styles.bar}>
        <RoundButton
          label="Back"
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
          icon={(color) => <ChevronLeft size={22} color={color} strokeWidth={2.25} />}
        />
        <View style={styles.trailing}>{trailing}</View>
      </View>
      {title ? (
        <View style={styles.text}>
          <View style={styles.titleRow}>
            {lead}
            <Text size="l" weight="heavy" accessibilityRole="header" numberOfLines={2} style={styles.title}>
              {title}
            </Text>
          </View>
          {subtitle ? (
            <Text size="xs" weight="medium" tone="muted" numeric numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { paddingHorizontal: 12, paddingBottom: 10, gap: 10 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { paddingHorizontal: 5, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flexShrink: 1 },
});
