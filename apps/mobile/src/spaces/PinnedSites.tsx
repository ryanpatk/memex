import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { getHostname, getLinkTitle, type LinkWithTag } from '@memex/core';
import { useTheme } from '../theme/theme';
import { usePressSettle } from '../ui/Pressable';
import { Text } from '../ui/Text';

/*
 * A space's pinned sites (web: the space page's launcher row, pins from
 * `profile_links.is_super_favorite`, ordered by core's spaceBoard): small
 * raised objects with the site's icon and name. Each opens its link detail.
 */
export const PinnedSites = ({ links, onOpen }: { links: LinkWithTag[]; onOpen: (id: string) => void }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.row, styles.cardsRow]} style={styles.scroll} accessibilityLabel="Pinned sites">
    {links.map((link) => (
      <Pin key={link.id} link={link} onPress={() => onOpen(link.id)} />
    ))}
  </ScrollView>
);

const Pin = ({ link, onPress }: { link: LinkWithTag; onPress: () => void }) => {
  const t = useTheme();
  const { palette } = t;
  const settle = usePressSettle();
  const [failed, setFailed] = useState(false);
  const title = getLinkTitle(link);
  const host = getHostname(link.url).replace(/^www\./, '');
  if (t.cards) {
    // Memory Cards (m02): each pin a 56px round button with the site's icon or first letter
    const c = t.cards;
    return (
      <Pressable accessibilityRole="link" accessibilityLabel={`Pinned: ${title}`} onPress={onPress} onPressIn={settle.onPressIn} onPressOut={settle.onPressOut}>
        <Animated.View
          style={[
            styles.cardsPin,
            { backgroundColor: c.colors.paper, boxShadow: `inset 0 0 0 2px ${c.colors.line}, inset 0 -4px 0 0 ${c.colors.line}` },
            settle.style,
          ]}
        >
          {link.favicon_url && !failed ? (
            <Image source={link.favicon_url} style={styles.cardsFav} onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
          ) : (
            <RNText style={[c.type.title, { color: c.colors.ink }]}>{host.slice(0, 1).toUpperCase()}</RNText>
          )}
        </Animated.View>
      </Pressable>
    );
  }
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`Pinned: ${title}`} onPress={onPress} onPressIn={settle.onPressIn} onPressOut={settle.onPressOut}>
      <Animated.View style={[styles.pin, { backgroundColor: palette.paper, boxShadow: t.objectShadow }, settle.style]}>
        <View style={[styles.icon, { backgroundColor: palette.well }]}>
          {link.favicon_url && !failed ? (
            <Image source={link.favicon_url} style={styles.fav} onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
          ) : (
            <Text size="xxs" weight="heavy" tone="muted">
              {host.slice(0, 1).toUpperCase()}
            </Text>
          )}
        </View>
        <Text size="xs" weight="medium" numberOfLines={1} style={styles.label}>
          {title}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  cardsPin: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  cardsFav: { width: 24, height: 24, borderRadius: 6 },
  scroll: { flexGrow: 0 },
  row: { gap: 8, paddingHorizontal: 17, paddingBottom: 10 },
  cardsRow: { gap: 12, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
  pin: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 34, paddingLeft: 5, paddingRight: 12, borderRadius: 9999, maxWidth: 200 },
  icon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  fav: { width: 16, height: 16 },
  label: { flexShrink: 1 },
});
