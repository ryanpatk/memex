import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import Animated from 'react-native-reanimated';
import { AlertCircle, CalendarPlus } from 'lucide-react-native';
import { dueLabel, isOverdue, daysUntilDue, type JournalSpace, type TaskWithTags } from '@memex/core';
import type { MenuItem } from '../journal/entryMenu';
import { TaskCheck } from '../journal/parts';
import { alpha, mix } from '../theme/palette';
import { useTheme } from '../theme/theme';
import { usePressSettle } from '../ui/Pressable';
import { SpaceChip } from '../ui/SpaceChip';
import { Text } from '../ui/Text';

/*
 * One task on the Tasks screen (web: .tk-row): the check, the title, the
 * spaces it's also in, and its due date as a chip you press to change. The
 * row sits on its group's paper card; the check and the due chip are
 * objects. Long-press for the menu (also VoiceOver actions).
 */

export const TaskRow = ({
  task,
  checked,
  chips,
  first,
  now,
  menu,
  onToggle,
  onDue,
  onMenu,
}: {
  task: TaskWithTags;
  /** Ticked, including a task that's holding in its group for a beat. */
  checked: boolean;
  /** Spaces to show as chips (the group's own space is left out). */
  chips: JournalSpace[];
  first: boolean;
  now?: Date;
  menu: MenuItem[];
  onToggle: () => void;
  onDue: () => void;
  onMenu: () => void;
}) => {
  const t = useTheme();
  const { palette } = t;
  const pending = task.id.startsWith('temp-');
  return (
    <View
      style={[
        styles.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.hairline },
        pending && styles.pending,
      ]}
      testID={`task-row-${task.id}`}
    >
      <TaskCheck done={checked} label={task.title} onPress={onToggle} />
      <Pressable
        onLongPress={onMenu}
        delayLongPress={350}
        accessibilityLabel={`Task: ${task.title}${checked ? ', done' : ''}`}
        accessibilityHint="Long-press for more"
        accessibilityActions={menu.map((i) => ({ name: i.name, label: i.label }))}
        onAccessibilityAction={(e: AccessibilityActionEvent) => menu.find((i) => i.name === e.nativeEvent.actionName)?.run()}
        style={styles.text}
      >
        <Text
          size="m"
          tone={checked ? 'muted' : 'ink'}
          numberOfLines={3}
          style={checked && { textDecorationLine: 'line-through', textDecorationColor: alpha(palette.muted, 0.6) }}
        >
          {task.title}
        </Text>
        {chips.length > 0 && (
          <View style={styles.chips}>
            {chips.map((s) => (
              <SpaceChip key={s.id} space={s} />
            ))}
          </View>
        )}
      </Pressable>
      {!checked && <DueChip task={task} now={now} onPress={onDue} />}
    </View>
  );
};

export const DueChip = ({ task, now = new Date(), onPress }: { task: TaskWithTags; now?: Date; onPress: () => void }) => {
  const t = useTheme();
  const { palette } = t;
  const settle = usePressSettle();
  const label = dueLabel(task.due_date, now);
  const overdue = isOverdue(task, now);
  const soon = !overdue && daysUntilDue(task.due_date, now) === 0;
  const color = overdue ? palette.error : soon ? palette.accentText : palette.inkSoft;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ? `Due ${label}${overdue ? ', overdue' : ''}. Change due date` : 'Set a due date'}
      onPress={onPress}
      onPressIn={settle.onPressIn}
      onPressOut={settle.onPressOut}
      hitSlop={8}
      disabled={task.id.startsWith('temp-')}
    >
      {label ? (
        <Animated.View
          style={[
            styles.due,
            {
              backgroundColor: overdue ? mix(palette.error, palette.paper, 0.1) : soon ? palette.tint : palette.paper,
              boxShadow: overdue ? `${t.objectShadow}, 0 0 0 1px ${alpha(palette.error, 0.3)}` : t.objectShadow,
            },
            settle.style,
          ]}
        >
          {overdue && <AlertCircle size={13} color={color} strokeWidth={2.25} />}
          <Text size="xs" weight="heavy" numeric style={{ color }}>
            {label}
          </Text>
        </Animated.View>
      ) : (
        <Animated.View style={[styles.addDue, settle.style]}>
          <CalendarPlus size={18} color={palette.faint} strokeWidth={1.75} />
        </Animated.View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 14, paddingRight: 10, paddingVertical: 10, minHeight: 52 },
  pending: { opacity: 0.6 },
  text: { flex: 1, minWidth: 0, gap: 5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  due: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28, paddingHorizontal: 10, borderRadius: 9999 },
  addDue: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
