import { type ReactNode } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/theme';
import { Text } from './Text';

const countFmt = new Intl.NumberFormat();

/**
 * A tab's heading: large title, a quiet line under it, an optional trailing
 * control. In the Memory Cards look the title is the 52px hero and carries
 * its count as a superscript (Cards²⁴⁸, Today¹¹), with no line under it.
 */
export const ScreenHeader = ({
  title,
  subtitle,
  trailing,
  hero,
  count,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  /** Memory Cards: the hero word when it differs from the title (“Today” on the Journal). */
  hero?: string;
  /** Memory Cards: the superscript count on the hero. */
  count?: number;
}) => {
  const insets = useSafeAreaInsets();
  const { cards } = useTheme();
  if (cards) {
    const word = hero ?? title;
    return (
      <View style={[styles.cardsRoot, { paddingTop: insets.top + 12 }]}>
        <View
          style={styles.heroRow}
          accessible
          accessibilityRole="header"
          accessibilityLabel={count !== undefined ? `${word}, ${countFmt.format(count)}` : word}
        >
          <RNText style={[cards.type.hero, { color: cards.colors.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {word}
          </RNText>
          {count !== undefined ? (
            <RNText style={[cards.type.labelUi, styles.sup, { color: cards.colors.muted }]}>{countFmt.format(count)}</RNText>
          ) : null}
        </View>
        {trailing}
      </View>
    );
  }
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
  cardsRoot: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 10 },
  heroRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start' },
  sup: { fontSize: 20, lineHeight: 22, fontFamily: 'Inter_600SemiBold', marginLeft: 6, marginTop: 2, fontVariant: ['tabular-nums'] },
});
