import { Tabs } from 'expo-router/tabs';
import * as Haptics from 'expo-haptics';
import { BookOpen, Inbox, MessageSquareText, Shapes, type LucideIcon } from 'lucide-react-native';
import { useJournal } from '../../data/useJournal';
import { typeRole, useTheme } from '../../theme/theme';

/*
 * The phone layout (decision 16A): a tab bar with Journal, Library, Spaces
 * and Inbox. The bar is paper (lit edge, soft depth); the active tab speaks
 * in the accent. The Inbox shows a count only while something is waiting.
 */

const icon = (Icon: LucideIcon) =>
  function TabIcon({ color, focused }: { color: unknown; focused: boolean }) {
    return <Icon size={23} color={String(color)} strokeWidth={focused ? 2.25 : 1.75} />;
  };

export default function TabsLayout() {
  const t = useTheme();
  const { palette } = t;
  const { journal } = useJournal();
  const waiting = journal?.inbox.length ?? 0;

  return (
    <Tabs
      screenListeners={{ tabPress: () => void Haptics.selectionAsync() }}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: palette.canvas },
        tabBarActiveTintColor: palette.accentText,
        tabBarInactiveTintColor: palette.muted,
        tabBarLabelStyle: { ...typeRole('xxs', 'medium'), marginTop: 2 },
        tabBarStyle: {
          backgroundColor: palette.paper,
          borderTopWidth: 0,
          boxShadow: `inset 0 1px 0 0 ${palette.lit}, 0 -1px 0 0 ${palette.dark ? '#ffffff12' : '#1d21270f'}, 0 -6px 18px -10px ${palette.shadowInk}33`,
        },
        tabBarBadgeStyle: { backgroundColor: palette.accent, color: palette.onAccent, ...typeRole('xxs', 'heavy') },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Journal', tabBarIcon: icon(MessageSquareText) }} />
      <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: icon(BookOpen) }} />
      <Tabs.Screen name="spaces" options={{ title: 'Spaces', tabBarIcon: icon(Shapes) }} />
      <Tabs.Screen
        name="inbox"
        options={{ title: 'Inbox', tabBarIcon: icon(Inbox), tabBarBadge: waiting > 0 ? waiting : undefined }}
      />
    </Tabs>
  );
}
