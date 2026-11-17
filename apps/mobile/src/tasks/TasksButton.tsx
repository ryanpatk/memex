import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ListChecks } from 'lucide-react-native';
import type { TaskWithTags } from '@memex/core';
import { taskTotals } from '../data/tasks';
import { useTheme } from '../theme/theme';
import { usePressSettle } from '../ui/Pressable';
import { Text } from '../ui/Text';

const countFmt = new Intl.NumberFormat();

/**
 * The way to Tasks from a header (the phone keeps decision 16A's four tabs):
 * a raised pill with the open count; a red dot when something is overdue.
 * On a space's screen it opens Tasks filtered to that space.
 */
export const TasksButton = ({ tasks, space }: { tasks: readonly TaskWithTags[]; space?: string }) => {
  const { cards, palette } = useTheme();
  const router = useRouter();
  const settle = usePressSettle();
  const { open, overdue } = taskTotals(tasks);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Tasks, ${open} open${overdue ? `, ${overdue} overdue` : ''}`}
      onPress={() => {
        void Haptics.selectionAsync();
        router.push(space ? { pathname: '/tasks', params: { space } } : '/tasks');
      }}
      onPressIn={settle.onPressIn}
      onPressOut={settle.onPressOut}
      hitSlop={6}
      testID="tasks-button"
    >
      <Animated.View
        style={[
          styles.pill,
          // a molded paper pill like the round buttons beside it
          { backgroundColor: cards.colors.paper, boxShadow: `inset 0 0 0 2px ${cards.colors.line}, inset 0 -4px 0 0 ${cards.colors.line}` },
          settle.style,
        ]}
      >
        <ListChecks size={20} color={palette.ink} strokeWidth={2.5} />
        <Text size="xs" weight="heavy" numeric>
          {countFmt.format(open)}
        </Text>
        {overdue > 0 && <View style={[styles.dot, { backgroundColor: palette.error, borderColor: palette.paper }]} />}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 14, borderRadius: 22 },
  dot: { position: 'absolute', top: -1, right: -1, width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
});
