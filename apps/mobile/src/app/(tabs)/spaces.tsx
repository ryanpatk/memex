import { useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, ListChecks, Shapes } from 'lucide-react-native';
import { summarizeSpaces } from '../../data/journal';
import { taskTotals } from '../../data/tasks';
import { useJournal } from '../../data/useJournal';
import { SpaceCard } from '../../spaces/SpaceCard';
import { useTheme } from '../../theme/theme';
import { Canvas } from '../../ui/Canvas';
import { FeedError } from '../../ui/FeedStates';
import { IconBadge } from '../../ui/IconBadge';
import { Paper } from '../../ui/Paper';
import { Placeholder } from '../../ui/Placeholder';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { Text } from '../../ui/Text';

const countFmt = new Intl.NumberFormat();

/**
 * Spaces (decision 16A's third tab): every space in its own hue with what's
 * in it and the newest few things, and Tasks across all of them on top.
 * A space opens its board: that space's Journal with the composer filing
 * there (decision 14B).
 */
export default function SpacesScreen() {
  const t = useTheme();
  const router = useRouter();
  const { journal, isLoading, error, refreshing, refresh } = useJournal();
  const summaries = useMemo(() => (journal ? summarizeSpaces(journal) : []), [journal]);
  const totals = journal ? taskTotals(journal.tasks) : null;
  const n = journal?.spaces.length ?? 0;

  return (
    <Canvas>
      <ScreenHeader title="Spaces" subtitle={journal ? `${countFmt.format(n)} ${n === 1 ? 'space' : 'spaces'}` : undefined} />
      {error && !journal ? (
        <FeedError error={error} onRetry={refresh} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.palette.muted} />}
          accessibilityLabel="Spaces"
        >
          {totals && (
            <Pressable accessibilityRole="link" accessibilityLabel={`Tasks, ${tasksLine(totals)}`} onPress={() => router.push('/tasks')}>
              {({ pressed }) => (
                <Paper level="s" radius={t.radius.l} style={[styles.tasks, pressed && { backgroundColor: t.palette.dark ? t.palette.well : t.palette.tint }]}>
                  <IconBadge size={34}>
                    <ListChecks size={18} color={t.palette.onAccent} strokeWidth={2.25} />
                  </IconBadge>
                  <View style={styles.tasksText}>
                    <Text size="m" weight="heavy">
                      Tasks
                    </Text>
                    <Text size="xs" tone="muted" numeric numberOfLines={1}>
                      {tasksLine(totals)}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={t.palette.faint} strokeWidth={2} />
                </Paper>
              )}
            </Pressable>
          )}

          {journal && n === 0 ? (
            <Placeholder
              icon={<Shapes size={26} color={t.palette.onAccent} strokeWidth={2} />}
              title="No spaces yet"
              body="Spaces are the contexts you file things into. Make one on the web and it shows up here."
            />
          ) : (
            !isLoading &&
            summaries.map((summary) => (
              <SpaceCard
                key={summary.space.id}
                summary={summary}
                onPress={() => router.push({ pathname: '/space/[id]', params: { id: summary.space.id } })}
              />
            ))
          )}
        </ScrollView>
      )}
    </Canvas>
  );
}

const tasksLine = ({ open, overdue, today }: { open: number; overdue: number; today: number }) =>
  open === 0
    ? 'All clear'
    : [`${countFmt.format(open)} open`, overdue ? `${countFmt.format(overdue)} overdue` : null, today ? `${countFmt.format(today)} due today` : null]
        .filter(Boolean)
        .join(' · ');

const styles = StyleSheet.create({
  scroll: { paddingTop: 4, paddingBottom: 33, paddingHorizontal: 17, gap: 10 },
  tasks: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 6 },
  tasksText: { flex: 1, minWidth: 0, gap: 1 },
});
