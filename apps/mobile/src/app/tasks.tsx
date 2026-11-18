import { useCallback, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, RefreshControl, StyleSheet, View, type ListRenderItem } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCheck, ChevronDown, ChevronRight, ListChecks } from 'lucide-react-native';
import {
  parseTaskGrouping,
  UNFILED_TASKS,
  type Entry,
  type JournalSpace,
  type TaskGroup,
  type TaskGrouping,
  type TaskWithTags,
} from '@memex/core';
import { taskTotals, toTasksView, type DueOption } from '../data/tasks';
import { SpacePills } from '../cards/SpacePills';
import { DueSheet } from '../tasks/DueSheet';
import { useJournal } from '../data/useJournal';
import { useEntryActions, entryLabel } from '../journal/useEntryActions';
import { showMenu } from '../journal/entryMenu';
import { DueDateSheet } from '../tasks/DueDateSheet';
import { TaskAdd } from '../tasks/TaskAdd';
import { TaskRow } from '../tasks/TaskRow';
import { taskMenuItems } from '../tasks/taskMenu';
import { useTaskActions } from '../tasks/useTaskActions';
import { useTheme } from '../theme/theme';
import { Canvas } from '../ui/Canvas';
import { FeedError, FeedSkeleton } from '../ui/FeedStates';
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
/** How long a sheet takes to slide away before the next one opens (iOS presents one modal at a time). */
const SHEET_GAP_MS = 350;
const countFmt = new Intl.NumberFormat();

type Item = { kind: 'group'; group: TaskGroup<TaskWithTags, JournalSpace> } | { kind: 'empty' } | { kind: 'done' };

export default function TasksScreen() {
  const { cards: c } = useTheme();
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
  // The Due sheet (m03)
  const [dueFor, setDueFor] = useState<TaskWithTags | null>(null);

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

  const openDue = (task: TaskWithTags) => setDueFor(task);

  const chooseDue = (task: TaskWithTags, option: DueOption) => {
    setDueFor(null);
    // One sheet at a time: the calendar opens once the Due sheet has slid away.
    if (option.value === 'pick') setTimeout(() => setPicking(task), SHEET_GAP_MS);
    else void taskActions.setDue(task, option.value);
  };

  const menuFor = (task: TaskWithTags) => {
    const entry = entries.get(task.id);
    // From the long-press menu, the Due sheet waits for the menu to close.
    return entry ? taskMenuItems(entry, spaces, entryActions, taskActions, () => setTimeout(() => openDue(task), SHEET_GAP_MS)) : [];
  };

  const rows = (tasks: TaskWithTags[], groupSpace?: string) =>
    tasks.map((task) => {
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
            {showDone ? <ChevronDown size={22} color={c.colors.muted} strokeWidth={2.75} /> : <ChevronRight size={22} color={c.colors.muted} strokeWidth={2.75} />}
            <Text size="m" weight="heavy" tone="muted">
              Done
            </Text>
            <Text size="s" tone="faint" numeric>
              {countFmt.format(done.length)}
            </Text>
          </Pressable>
          {showDone && (
            <>
              <View style={styles.rows}>{rows(shown)}</View>
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
        {/* d27, m03: each group opens on a molded band in its space's colour */}
        <View
          style={[styles.band, { backgroundColor: group.space?.color ?? (overdue ? c.colors.error : c.colors.line), boxShadow: c.molded() }]}
          accessibilityRole="header"
          accessible
          accessibilityLabel={`${group.label}, ${group.tasks.length}`}
        >
          <Text size="m" weight="heavy" numberOfLines={1} style={[styles.shrink, { color: overdue && !group.space ? '#ffffff' : c.colors.onColor }]}>
            {group.label}
          </Text>
          <Text size="s" weight="heavy" numeric style={{ color: overdue && !group.space ? '#ffffff' : c.colors.onColor, opacity: 0.75 }}>
            {countFmt.format(group.tasks.length)}
          </Text>
        </View>
        <View style={styles.rows}>{rows(group.tasks, group.space?.id)}</View>
      </View>
    );
  };

  const grouping = (
    <Segmented
      label="Group tasks"
      options={[
        { value: 'space', label: 'Space', a11y: 'By space' },
        { value: 'date', label: 'Date', a11y: 'By due date' },
      ]}
      value={by}
      onChange={(next) => {
        setBy(next);
        sync({ group: next });
      }}
    />
  );

  const pickSpace = (next: string | null) => {
    setSpace(next);
    sync({ space: next });
  };

  // The space pills (with open counts) filter; the add field under them
  const filters = !journal || !view ? undefined : (
    <View style={styles.controls}>
      <View style={styles.pills}>
        <SpacePills
          label="Filter by space"
          spaces={spaces.filter((s) => s.id === space || (!s.hidden && (view.counts.get(s.id) ?? 0) > 0))}
          selected={space}
          onSelect={pickSpace}
          allCount={totals?.open}
          counts={view.counts}
          extra={(view.counts.get(UNFILED_TASKS) ?? 0) > 0 || space === UNFILED_TASKS ? [{ id: UNFILED_TASKS, name: 'Unfiled' }] : []}
        />
      </View>
      <TaskAdd spaces={spaces} defaultSpace={filterSpace} onAdd={taskActions.add} />
    </View>
  );

  return (
    <Canvas>
      <StackHeader title="Tasks" count={totals && !unavailable ? totals.open : undefined} trailing={journal && view ? grouping : undefined} />
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
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.colors.muted} />}
            accessibilityLabel="Tasks"
            testID="tasks-list"
          />
        )}
      </KeyboardAvoidingView>
      <DueSheet task={dueFor} onChoose={chooseDue} onClose={() => setDueFor(null)} />
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

/** Nothing open: no tasks at all, everything done, or the filter hides it all. */
const Empty = ({ total, filter, onShowAll }: { total: number; filter: string | null; onShowAll: () => void }) => {
  if (filter)
    return (
      <Placeholder icon={<ListChecks />} title={`Nothing open in ${filter}`} body="Every task here is done.">
        <Button label="Show every space" onPress={onShowAll} />
      </Placeholder>
    );
  return total === 0 ? (
    <Placeholder icon={<ListChecks />} title="Nothing to do yet" body="Add a task above, or start a line with “[] ” in the Journal." />
  ) : (
    <Placeholder icon={<CheckCheck />} title="All clear" body="Everything’s done. Nice." />
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { paddingHorizontal: 20, gap: 20 },
  controls: { gap: 12, marginBottom: 4 },
  pills: { marginHorizontal: -20 },
  group: { gap: 12 },
  rows: { gap: 12 },
  band: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, height: 56, borderRadius: 24, paddingHorizontal: 20 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, minHeight: 44 },
  shrink: { flexShrink: 1 },
});
