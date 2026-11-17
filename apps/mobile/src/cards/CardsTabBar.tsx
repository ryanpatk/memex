import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import * as Haptics from 'expo-haptics';
import { BookOpen, Inbox, MessageSquareText, Plus, Shapes, type LucideIcon } from 'lucide-react-native';
import { useCards } from './useCards';

/*
 * The Memory Cards tab bar (s11, m01; decision 9: the centre +): Journal,
 * Cards, a raised blue + in the thumb spot, Spaces, Inbox. The active tab
 * fills its icon tile with ink; the Inbox carries a coral count. The + opens
 * the Journal with the composer focused (capture is the primary action).
 */

const TABS: Record<string, { title: string; icon: LucideIcon }> = {
  index: { title: 'Journal', icon: MessageSquareText },
  library: { title: 'Cards', icon: BookOpen },
  spaces: { title: 'Spaces', icon: Shapes },
  inbox: { title: 'Inbox', icon: Inbox },
};

export const CardsTabBar = ({ state, navigateToTab, insets, waiting }: BottomTabBarProps & { waiting: number }) => {
  const c = useCards();
  const router = useRouter();
  const routes = state.routes.filter((route) => TABS[route.name]);
  const half = Math.ceil(routes.length / 2);

  const tab = (route: (typeof routes)[number]) => {
    const meta = TABS[route.name];
    const focused = state.routes[state.index]?.key === route.key;
    const Icon = meta.icon;
    const badge = route.name === 'inbox' && waiting > 0 ? waiting : 0;
    return (
      <Pressable
        key={route.key}
        onPress={() => {
          void Haptics.selectionAsync();
          if (!focused) navigateToTab(route.key);
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={badge ? `${meta.title}, ${badge} waiting` : meta.title}
        style={styles.tab}
        testID={`tab-${route.name}`}
      >
        {({ pressed }) => (
          <View style={[styles.tabInner, pressed && { transform: [{ scale: 0.92 }] }]}>
            <View
              style={[
                styles.iconTile,
                focused ? { backgroundColor: c.colors.ink } : { boxShadow: `inset 0 0 0 3px ${focused ? c.colors.ink : c.colors.faint}` },
              ]}
            >
              <Icon size={16} color={focused ? c.colors.paper : c.colors.faint} strokeWidth={2.5} />
            </View>
            <RNText style={[c.type.label, { color: focused ? c.colors.ink : c.colors.faint }]} numberOfLines={1}>
              {meta.title}
            </RNText>
            {badge ? (
              <View style={[styles.badge, { backgroundColor: '#ff5a6f' }]}>
                <RNText style={[c.type.labelUi, styles.badgeText, { color: c.colors.onColor }]}>{badge}</RNText>
              </View>
            ) : null}
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: c.colors.paper,
          paddingBottom: Math.max(insets.bottom, 10),
          boxShadow: '0 -10px 30px -16px #00000040',
        },
      ]}
      accessibilityRole="tablist"
    >
      {routes.slice(0, half).map(tab)}
      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.navigate({ pathname: '/', params: { compose: String(Date.now()) } });
        }}
        accessibilityRole="button"
        accessibilityLabel="Save something"
        style={styles.plusCell}
        testID="tab-plus"
      >
        {({ pressed }) => (
          <View
            style={[
              styles.plus,
              {
                backgroundColor: c.colors.primary,
                boxShadow: `0 10px 24px -8px #5077ffb3, ${c.molded(pressed)}`,
                transform: pressed ? [{ scale: 0.92 }] : undefined,
              },
            ]}
          >
            <Plus size={34} color="#ffffff" strokeWidth={3} />
          </View>
        )}
      </Pressable>
      {routes.slice(half).map(tab)}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-around', paddingTop: 10, paddingHorizontal: 6 },
  tab: { flex: 1, alignItems: 'center', minHeight: 56 },
  tabInner: { alignItems: 'center', gap: 4 },
  iconTile: { width: 30, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: -10, top: -10, minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { lineHeight: 22 },
  plusCell: { flex: 1, alignItems: 'center' },
  plus: { width: 68, height: 68, borderRadius: 34, marginTop: -30, alignItems: 'center', justifyContent: 'center' },
});
