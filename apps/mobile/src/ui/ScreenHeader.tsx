import { type ReactNode } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/theme';

const countFmt = new Intl.NumberFormat();

/**
 * A tab's heading (m01): the 52px hero word with its count as a superscript
 * (Cards²⁴⁸, Today¹¹), and the tab's round buttons on the right.
 */
export const ScreenHeader = ({
  title,
  trailing,
  hero,
  count,
}: {
  title: string;
  trailing?: ReactNode;
  /** The hero word when it differs from the title (“Today” on the Journal). */
  hero?: string;
  /** The superscript count on the hero. */
  count?: number;
}) => {
  const insets = useSafeAreaInsets();
  const { cards } = useTheme();
  const word = hero ?? title;
  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <View
        style={styles.heroRow}
        accessible
        accessibilityRole="header"
        accessibilityLabel={count !== undefined ? `${word}, ${countFmt.format(count)}` : word}
      >
        <RNText style={[cards.type.hero, { color: cards.colors.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {word}
        </RNText>
        {count !== undefined ? <RNText style={[cards.type.labelUi, styles.sup, { color: cards.colors.muted }]}>{countFmt.format(count)}</RNText> : null}
      </View>
      {trailing}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 10 },
  heroRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start' },
  sup: { fontSize: 20, lineHeight: 22, fontFamily: 'Inter_600SemiBold', marginLeft: 6, marginTop: 2, fontVariant: ['tabular-nums'] },
});
