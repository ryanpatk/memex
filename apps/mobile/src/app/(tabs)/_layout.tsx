import { Tabs } from 'expo-router/tabs';
import { CaptureHost } from '../../cards/CaptureSheet';
import { CardsTabBar } from '../../cards/CardsTabBar';
import { useInbox } from '../../data/useInbox';
import { useTheme } from '../../theme/theme';

/*
 * The phone layout (decision 16A; Memory Cards s11, m01): Journal, Cards,
 * the raised + (Save something, m05), Spaces, Inbox. The Inbox shows a count
 * only while something is waiting (filing suggestions and agents'
 * proposals). Tasks, notes, a link and a space's board are pushed screens
 * over the tabs.
 */
export default function TabsLayout() {
  const { palette } = useTheme();
  // Filing suggestions plus agents' proposals, like the web's Inbox count.
  const { count: waiting } = useInbox();

  return (
    <>
      <Tabs
        tabBar={(props) => <CardsTabBar {...props} waiting={waiting} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: palette.canvas } }}
      >
        <Tabs.Screen name="index" options={{ title: 'Journal' }} />
        <Tabs.Screen name="library" options={{ title: 'Cards' }} />
        <Tabs.Screen name="spaces" options={{ title: 'Spaces' }} />
        <Tabs.Screen name="inbox" options={{ title: 'Inbox' }} />
      </Tabs>
      {/* Save something (m05): the + opens it over whichever tab is showing */}
      <CaptureHost />
    </>
  );
}
