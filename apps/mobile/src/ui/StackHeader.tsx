import { type ReactNode } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { RoundButton } from './RoundButton';
import { Text } from './Text';
import { useTheme } from '../theme/theme';

const countFmt = new Intl.NumberFormat();

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
  band,
  count,
}: {
  title?: string;
  subtitle?: string;
  lead?: ReactNode;
  trailing?: ReactNode;
  /** Replaces the default (e.g. to ask before dropping unsaved changes). */
  onBack?: () => void;
  /** Memory Cards: the space's colour; the header becomes a molded band under the status bar (m02). */
  band?: string;
  /** Memory Cards: a superscript count on the title (Tasks⁶). */
  count?: number;
}) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cards } = useTheme();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  if (cards) {
    const ink = band ? cards.colors.onColor : cards.colors.ink;
    return (
      <View
        style={[
          styles.cardsRoot,
          { paddingTop: insets.top + 8 },
          band && { backgroundColor: band, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, boxShadow: cards.molded(), paddingBottom: 22, marginBottom: 12 },
        ]}
      >
        <View style={styles.bar}>
          <RoundButton label="Back" onPress={back} icon={(color) => <ChevronLeft size={22} color={color} strokeWidth={2.75} />} />
          <View style={styles.trailing}>{trailing}</View>
        </View>
        {title ? (
          <View style={styles.cardsText}>
            <View style={styles.titleRow} accessible accessibilityRole="header" accessibilityLabel={count !== undefined ? `${title}, ${count}` : title}>
              {!band && lead}
              <RNText style={[cards.type.h1, { fontSize: 40, lineHeight: 44, color: ink, flexShrink: 1 }]} numberOfLines={2}>
                {title}
              </RNText>
              {count !== undefined ? (
                <RNText style={[cards.type.labelUi, styles.sup, { color: band ? ink : cards.colors.muted }]}>{countFmt.format(count)}</RNText>
              ) : null}
            </View>
            {subtitle ? (
              <RNText style={[cards.type.labelUi, { color: ink, opacity: band ? 0.75 : 1, fontFamily: 'Inter_500Medium' }]} numberOfLines={1}>
                {subtitle}
              </RNText>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }
  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <View style={styles.bar}>
        <RoundButton
          label="Back"
          onPress={back}
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
  cardsRoot: { paddingHorizontal: 20, paddingBottom: 10, gap: 14 },
  cardsText: { gap: 4 },
  sup: { fontSize: 20, lineHeight: 22, fontFamily: 'Inter_600SemiBold', alignSelf: 'flex-start', marginTop: 2, fontVariant: ['tabular-nums'] },
});
