import { Pressable, StyleSheet, Text as RNText, View, type AccessibilityActionEvent } from 'react-native';
import { CalendarPlus } from 'lucide-react-native';
import { dueLabel, isOverdue, daysUntilDue, type JournalSpace, type TaskWithTags } from '@memex/core';
import type { MenuItem } from '../journal/entryMenu';
import { TaskCheck } from '../journal/parts';
import { useTheme } from '../theme/theme';
import { SpaceChip } from '../ui/SpaceChip';
import { useCards } from '../cards/useCards';

/*
 * One task (s09 task row, m03; web: .tk-row): its own paper row with the big
 * check, the title, the other spaces it's in, and its due date as a chip you
 * press to change. Long-press for the menu (also VoiceOver actions).
 */
export const TaskRow = ({
  task,
  checked,
  chips,
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
  now?: Date;
  menu: MenuItem[];
  onToggle: () => void;
  onDue: () => void;
  onMenu: () => void;
}) => {
  const { cards: c, palette } = useTheme();
  const pending = task.id.startsWith('temp-');
  return (
    <View
      style={[styles.row, { backgroundColor: c.colors.paper, boxShadow: `inset 0 2px 0 0 ${palette.lit}, ${c.softShadow}` }, pending && styles.pending]}
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
        <RNText style={[c.type.title, { color: checked ? c.colors.faint : c.colors.ink }, checked && styles.struck]} numberOfLines={3}>
          {task.title}
        </RNText>
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

/** The due date (s09 `.due`): a 36px pill; today gold, overdue red, the rest a quiet well. No date: a calendar button. */
export const DueChip = ({ task, now = new Date(), onPress }: { task: TaskWithTags; now?: Date; onPress: () => void }) => {
  const c = useCards();
  const label = dueLabel(task.due_date, now);
  const overdue = isOverdue(task, now);
  const soon = !overdue && daysUntilDue(task.due_date, now) === 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ? `Due ${label}${overdue ? ', overdue' : ''}. Change due date` : 'Set a due date'}
      onPress={onPress}
      hitSlop={8}
      disabled={task.id.startsWith('temp-')}
    >
      {({ pressed }) =>
        label ? (
          <View style={[styles.due, { backgroundColor: overdue ? c.colors.errorBg : soon ? c.extra.todayBg : c.colors.well, transform: pressed ? [{ scale: 0.94 }] : undefined }]}>
            <RNText
              style={[
                c.type.labelUi,
                { fontFamily: 'Inter_600SemiBold', color: overdue ? c.colors.error : soon ? c.extra.todayInk : c.colors.muted, fontVariant: ['tabular-nums'] },
              ]}
            >
              {label}
            </RNText>
          </View>
        ) : (
          <View style={[styles.addDue, { transform: pressed ? [{ scale: 0.94 }] : undefined }]}>
            <CalendarPlus size={22} color={c.colors.faint} strokeWidth={2.25} />
          </View>
        )
      }
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 76, borderRadius: 24, paddingLeft: 16, paddingRight: 14, paddingVertical: 12 },
  pending: { opacity: 0.6 },
  text: { flex: 1, minWidth: 0, gap: 8 },
  struck: { textDecorationLine: 'line-through' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  due: { height: 36, borderRadius: 18, paddingHorizontal: 12, justifyContent: 'center' },
  addDue: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
