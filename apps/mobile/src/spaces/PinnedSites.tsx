import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text as RNText } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { getHostname, getLinkTitle, type LinkWithTag } from '@memex/core';
import { useCards } from '../cards/useCards';
import { usePressSettle } from '../ui/Pressable';

/*
 * A space's pinned sites (m02; web: the space page's launcher row, pins from
 * `profile_links.is_super_favorite`, ordered by core's spaceBoard): each a
 * 56px round button with the site's icon or first letter. Each opens its
 * link.
 */
export const PinnedSites = ({ links, onOpen }: { links: LinkWithTag[]; onOpen: (id: string) => void }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} style={styles.scroll} accessibilityLabel="Pinned sites">
    {links.map((link) => (
      <Pin key={link.id} link={link} onPress={() => onOpen(link.id)} />
    ))}
  </ScrollView>
);

const Pin = ({ link, onPress }: { link: LinkWithTag; onPress: () => void }) => {
  const c = useCards();
  const settle = usePressSettle();
  const [failed, setFailed] = useState(false);
  const title = getLinkTitle(link);
  const host = getHostname(link.url).replace(/^www\./, '');
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`Pinned: ${title}`} onPress={onPress} onPressIn={settle.onPressIn} onPressOut={settle.onPressOut}>
      <Animated.View
        style={[styles.pin, { backgroundColor: c.colors.paper, boxShadow: `inset 0 0 0 2px ${c.colors.line}, inset 0 -4px 0 0 ${c.colors.line}` }, settle.style]}
      >
        {link.favicon_url && !failed ? (
          <Image source={link.favicon_url} style={styles.fav} onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
        ) : (
          <RNText style={[c.type.title, { color: c.colors.ink }]}>{host.slice(0, 1).toUpperCase()}</RNText>
        )}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { gap: 12, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 },
  pin: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  fav: { width: 24, height: 24, borderRadius: 6 },
});
