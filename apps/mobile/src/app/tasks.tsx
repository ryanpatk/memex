import { useCallback, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View, type ListRenderItem } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertCircle, CheckCheck, ChevronDown, ChevronRight, ListChecks } from 'lucide-react-native';
import {
  parseTaskGrouping,
  UNFILED_TASKS,
  type Entry,
  type JournalSpace,
  type TaskGroup,
  type TaskGrouping,
  type TaskWithTags,
} from '@memex/core';
import { dueOptions, taskTotals, toTasksView } from '../data/tasks';
import { useJournal } from '../data/useJournal';
import { useEntryActions, entryLabel } from '../journal/useEntryActions';
import { showMenu } from '../journal/entryMenu';
import { DueDateSheet } from '../tasks/DueDateSheet';
import { showDueMenu } from '../tasks/dueMenu';
import { TaskAdd } from '../tasks/TaskAdd';
import { TaskRow } from '../tasks/TaskRow';
import { taskMenuItems } from '../tasks/taskMenu';
import { useTaskActions } from '../tasks/useTaskActions';
import { useTheme } from '../theme/theme';
import { Canvas } from '../ui/Canvas';
import { FeedError, FeedSkeleton } from '../ui/FeedStates';
import { FilterChip } from '../ui/FilterChip';
import { Paper } from '../ui/Paper';
import { Placeholder } from '../ui/Placeholder';
import { Button } from '../ui/Pressable';
import { Segmented } from '../ui/Segmented';
import { StackHeader } from '../ui/StackHeader';
import { Text } from '../ui/Text';
import { useToast } from '../ui/Toast';

/*
 * Tasks (docs/tasks-view.md, phone form): open tasks across every space,
 * grouped by space or by due date, a single-choice space filter, tick with
 * Undo (the row holds a beat, then moves to Done), due dates from the chip
 * or the menu, and a folded Done list. Everything is core's Tasks model
 * (data/tasks.ts). Reached from the Journal's header, the Spaces tab and a
 * space's header. Deep links: `?group=date`, `?space=<id>|unfiled`, `?done=1`.
 */

const DONE_PAGE = 50;
const countFmt = new Intl.NumberFormat();

type Item = { kind: 'group'; group: TaskGroup<TaskWithTags, JournalSpace> } | { kind: 'empty' } | { kind: 'done' };

export default function TasksScreen() {
  const t = useTheme();
  const { palette } = t;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const params = useLocalSearchParams<{ group?: string; space?: string; done?: string }>();
  const { journal, isLoading, unavailable, error, refreshing, refresh } = useJournal();
  const entryActions = useEntryActions();
  const taskActions = useTaskActions();
  const [by, setBy] = useState<TaskGrouping>(parseTaskGrouping(params.group));
  const [space, setSpace] = useState<string | null>(params.space || null);
  const [showDone, setShowDone] = useState(params.done === '1');
  const [donePage, setDonePage] = useState(1);
  const [picking, setPicking] = useState<TaskWithTags | null>(null);

  useFocusEffect(
    useCallback(() => {
      toast.setInset(insets.bottom + 16);
      return () => toast.setInset(96);
    }, [insets.bottom, toast]),
  );

  // The URL follows what's on screen, so every state is a deep link.
  const sync = (next: { group?: TaskGrouping; space?: string | null; done?: boolean }) =>
    router.setParams({
      group: (next.group ?? by) === 'date' ? 'date' : undefined,
      space: (next.space === undefined ? space : next.space) ?? undefined,
      done: (next.done ?? showDone) ? '1' : undefined,
    });

  const spaces = useMemo(() => journal?.spaces ?? [], [journal]);
  const view = useMemo(
    () =>
      journal
        ? toTasksView({ tasks: journal.tasks, membership: journal.taskMembership, spaces, by, space, holding: taskActions.holding })
        : null,
    [by, journal, space, spaces, taskActions.holding],
  );
  const entries = useMemo(
    () => new Map((journal?.entries ?? []).filter((e): e is Extract<Entry, { kind: 'task' }> => e.kind === 'task').map((e) => [e.task.id, e])),
    [journal],
  );
  const filterSpace = space && space !== UNFILED_TASKS ? spaces.find((s) => s.id === space) : undefined;
  const totals = journal ? taskTotals(journal.tasks) : null;

  const openDue = (task: TaskWithTags) =>
    showDueMenu(task.title, dueOptions(task), (option) => {
      if (option.value === 'pick') setPicking(task);
      else void taskActions.setDue(task, option.value);
    });

  const menuFor = (task: TaskWithTags) => {
    const entry = entries.get(task.id);
    return entry ? taskMenuItems(entry, spaces, entryActions, taskActions, () => openDue(task)) : [];
  };

  const rows = (tasks: TaskWithTags[], groupSpace?: string) =>
    tasks.map((task, i) => {
      const filed = view?.membership.get(task.id) ?? [];
      const chips = spaces.filter((s) => filed.includes(s.id) && s.id !== groupSpace);
      const menu = menuFor(task);
      const entry = entries.get(task.id);
      return (
        <TaskRow
          key={task.id}
          task={task}
          checked={task.is_done}
          chips={chips}
          first={i === 0}
          menu={menu}
          onToggle={() => void taskActions.toggle(task)}
          onDue={() => openDue(task)}
          onMenu={() => entry && showMenu(entryLabel(entry), menu)}
        />
      );
    });

  const items: Item[] = view
    ? [...(view.groups.length ? view.groups.map((group) => ({ kind: 'group' as const, group })) : [{ kind: 'empty' as const }]), { kind: 'done' }]
    : [];

  const renderItem: ListRenderItem<Item> = ({ item }) => {
    if (item.kind === 'empty') return <Empty total={view?.total ?? 0} filter={filterSpace?.name ?? (space ? 'Unfiled' : null)} onShowAll={() => (setSpace(null), sync({ space: null }))} />;
    if (item.kind === 'done') {
      const done = view?.done ?? [];
      if (!done.length) return null;
      const shown = done.slice(0, donePage * DONE_PAGE);
      return (
        <View style={styles.group}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showDone }}
            accessibilityLabel={`Done, ${done.length}`}
            onPress={() => {
              setShowDone(!showDone);
              sync({ done: !showDone });
            }}
            style={styles.groupHead}
            hitSlop={8}
          >
            {showDone ? <ChevronDown size={16} color={palette.muted} strokeWidth={2.25} /> : <ChevronRight size={16} color={palette.muted} strokeWidth={2.25} />}
            <Text size="xs" weight="heavy" tone="muted">
              Done
            </Text>
            <Text size="xs" tone="faint" numeric>
              {countFmt.format(done.length)}
            </Text>
          </Pressable>
          {showDone && (
            <>
              <Paper radius={t.radius.l} style={styles.card}>
                {rows(shown)}
              </Paper>
              {done.length > shown.length && (
                <Button label={`Show ${Math.min(DONE_PAGE, done.length - shown.length)} more`} variant="ghost" onPress={() => setDonePage((p) => p + 1)} />
              )}
            </>
          )}
        </View>
      );
    }
    const { group } = item;
    const overdue = group.bucket === 'overdue';
    return (
      <View style={styles.group}>
        <View style={styles.groupHead} accessibilityRole="header" accessible accessibilityLabel={`${group.label}, ${group.tasks.length}`}>
          {group.space ? (
            <View style={[styles.dot, { backgroundColor: group.space.color }]} />
          ) : overdue ? (
            <AlertCircle size={14} color={palette.error} strokeWidth={2.25} />
          ) : null}
          <Text size="xs" weight="heavy" tone={overdue ? 'error' : 'soft'} numberOfLines={1} style={styles.shrink}>
            {group.label}
          </Text>
          <Text size="xs" tone="faint" numeric>
            {countFmt.format(group.tasks.length)}
          </Text>
        </View>
        <Paper radius={t.radius.l} style={styles.card}>
          {rows(group.tasks, group.space?.id)}
        </Paper>
      </View>
    );
  };

  const filters = !journal || !view ? undefined : (
    <View style={styles.controls}>
      <Segmented
        label="Group tasks"
        options={[
          { value: 'space', label: 'By space' },
          { value: 'date', label: 'By due date' },
        ]}
        value={by}
        onChange={(next) => {
          setBy(next);
          sync({ group: next });
        }}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipScroll} accessibilityLabel="Filter by space">
        <FilterChip label="Every space" count={totals?.open} on={!space} onPress={() => (setSpace(null), sync({ space: null }))} />
        {spaces
          .filter((s) => (view.counts.get(s.id) ?? 0) > 0 || s.id === space)
          .map((s) => (
            <FilterChip
              key={s.id}
              label={s.name}
              count={view.counts.get(s.id) ?? 0}
              on={space === s.id}
              onPress={() => {
                const next = space === s.id ? null : s.id;
                setSpace(next);
                sync({ space: next });
              }}
            />
          ))}
        {((view.counts.get(UNFILED_TASKS) ?? 0) > 0 || space === UNFILED_TASKS) && (
          <FilterChip
            label="Unfiled"
            count={view.counts.get(UNFILED_TASKS) ?? 0}
            on={space === UNFILED_TASKS}
            onPress={() => {
              const next = space === UNFILED_TASKS ? null : UNFILED_TASKS;
              setSpace(next);
              sync({ space: next });
            }}
          />
        )}
      </ScrollView>
      <TaskAdd spaces={spaces} defaultSpace={filterSpace} onAdd={taskActions.add} />
    </View>
  );

  const subtitle = totals && !unavailable
    ? totals.open === 0
      ? 'All clear'
      : [`${countFmt.format(totals.open)} open`, totals.overdue ? `${countFmt.format(totals.overdue)} overdue` : null, totals.today ? `${countFmt.format(totals.today)} due today` : null]
          .filter(Boolean)
          .join(' · ')
    : undefined;

  return (
    <Canvas>
      <StackHeader title="Tasks" subtitle={subtitle} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        {isLoading ? (
          <FeedSkeleton />
        ) : unavailable ? (
          <FeedError error={error} onRetry={refresh} title="Couldn’t load your tasks" retrying={refreshing} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => (item.kind === 'group' ? `group:${item.group.key}` : item.kind)}
            renderItem={renderItem}
            ListHeaderComponent={filters}
            contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 33 }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={palette.muted} />}
            accessibilityLabel="Tasks"
            testID="tasks-list"
          />
        )}
      </KeyboardAvoidingView>
      {picking && (
        <DueDateSheet
          title={picking.title}
          due={picking.due_date}
          onClose={() => setPicking(null)}
          onSet={(day) => {
            const task = picking;
            setPicking(null);
            void taskActions.setDue(task, day);
          }}
        />
      )}
    </Canvas>
  );
}

/** Nothing open: no tasks at all, everything done (an “on” state, so the disc is glossy), or the filter hides it all. */
const Empty = ({ total, filter, onShowAll }: { total: number; filter: string | null; onShowAll: () => void }) => {
  const { palette } = useTheme();
  if (filter)
    return (
      <Placeholder icon={<ListChecks size={26} color={palette.onAccent} strokeWidth={2} />} title={`Nothing open in ${filter}`} body="Every task here is done.">
        <Button label="Show every space" onPress={onShowAll} />
      </Placeholder>
    );
  return total === 0 ? (
    <Placeholder
      icon={<ListChecks size={26} color={palette.onAccent} strokeWidth={2} />}
      title="Nothing to do yet"
      body="Add a task above, or start a line with “[] ” in the Journal."
    />
  ) : (
    <Placeholder icon={<CheckCheck size={26} color={palette.onAccent} strokeWidth={2} />} title="All clear" body="Everything’s done. Nice." />
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { paddingHorizontal: 17, gap: 17 },
  controls: { gap: 12, marginBottom: 4 },
  chipScroll: { marginHorizontal: -17 },
  chips: { gap: 8, paddingHorizontal: 17, paddingVertical: 2 },
  group: { gap: 8 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 4, minHeight: 24 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  shrink: { flexShrink: 1 },
  card: { overflow: 'hidden' },
});
