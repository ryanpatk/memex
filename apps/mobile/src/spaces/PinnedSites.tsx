import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text as RNText, type AccessibilityActionEvent } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { getHostname, getLinkTitle, type LinkWithTag } from '@memex/core';
import { useCards } from '../cards/useCards';
import { usePressSettle } from '../ui/Pressable';

/*
 * Pinned sites as 56px round buttons with the site's icon or first letter
 * (m02; web: the top bar's pins and the space board's row). A space page
 * shows the space's pins (`profile_links`), the Spaces tab the global ones
 * (`links.is_super_favorite`), both in core's pin order. A press opens the
 * link; a long press opens the pin's menu (Open, Move earlier, Move later,
 * Unpin), which are also its VoiceOver actions.
 */

export interface PinRow {
  name: string;
  label: string;
  run: () => void;
}

export const PinnedSites = ({
  links,
  onOpen,
  onLongPress,
  actionsFor,
  inset = 20,
}: {
  links: LinkWithTag[];
  onOpen: (id: string) => void;
  onLongPress?: (link: LinkWithTag, index: number) => void;
  /** VoiceOver actions for one pin (usePinMenu's rows). */
  actionsFor?: (link: LinkWithTag, index: number) => PinRow[];
  /** Side padding of the row, so it lines up with the screen it sits in. */
  inset?: number;
}) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={[styles.row, { paddingHorizontal: inset }]}
    style={styles.scroll}
    accessibilityLabel="Pinned sites"
  >
    {links.map((link, index) => (
      <Pin
        key={link.id}
        link={link}
        onPress={() => onOpen(link.id)}
        onLongPress={onLongPress ? () => onLongPress(link, index) : undefined}
        rows={actionsFor?.(link, index) ?? []}
      />
    ))}
  </ScrollView>
);

const Pin = ({ link, onPress, onLongPress, rows }: { link: LinkWithTag; onPress: () => void; onLongPress?: () => void; rows: PinRow[] }) => {
  const c = useCards();
  const settle = usePressSettle();
  const [failed, setFailed] = useState(false);
  const title = getLinkTitle(link);
  const host = getHostname(link.url).replace(/^www\./, '');
  const extra = rows.filter((r) => r.name !== 'open');
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Pinned: ${title}`}
      accessibilityActions={extra.map((r) => ({ name: r.name, label: r.label }))}
      onAccessibilityAction={(event: AccessibilityActionEvent) => extra.find((r) => r.name === event.nativeEvent.actionName)?.run()}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={settle.onPressIn}
      onPressOut={settle.onPressOut}
    >
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
  row: { gap: 12, paddingTop: 4, paddingBottom: 12 },
  pin: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  fav: { width: 24, height: 24, borderRadius: 6 },
});
