import { useMemo } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Shapes } from 'lucide-react-native';
import { summarizeSpaces } from '../data/journal';
import { taskTotals } from '../data/tasks';
import { useJournal } from '../data/useJournal';
import { AccountButton } from '../ui/AccountButton';
import { Canvas } from '../ui/Canvas';
import { FeedError, FeedSkeleton } from '../ui/FeedStates';
import { Placeholder } from '../ui/Placeholder';
import { ScreenHeader } from '../ui/ScreenHeader';
import { SpaceTile } from './SpaceTile';
import { useCards } from './useCards';

/*
 * The Spaces tab (m02, x03 tiles): a wide ink Tasks
 * tile with the open count on top, then each space as a colour tile with its
 * count big. A tile opens the space's board.
 */
export const CardsSpaces = () => {
  const c = useCards();
  const router = useRouter();
  const { journal, isLoading, unavailable, error, refreshing, refresh } = useJournal();
  const summaries = useMemo(() => (journal ? summarizeSpaces(journal) : []), [journal]);
  const totals = journal ? taskTotals(journal.tasks) : null;

  return (
    <Canvas>
      <ScreenHeader title="Spaces" trailing={<AccountButton />} />
      {isLoading ? (
        <FeedSkeleton />
      ) : unavailable ? (
        <FeedError error={error} onRetry={refresh} title="Couldn’t load your spaces" retrying={refreshing} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.colors.muted} />}
          accessibilityLabel="Spaces"
        >
          {totals && (
            <SpaceTile
              wide
              name="Tasks"
              count={totals.open}
              onPress={() => router.push('/tasks')}
              accessibilityLabel={`Tasks, ${totals.open} open${totals.overdue ? `, ${totals.overdue} overdue` : ''}`}
            />
          )}
          {journal && journal.spaces.length === 0 ? (
            <Placeholder
              icon={<Shapes size={26} color="#ffffff" strokeWidth={2.5} />}
              title="No spaces yet"
              body="Spaces are the contexts you file things into. Make one on the web and it shows up here."
            />
          ) : (
            <View style={styles.grid}>
              {summaries.map((summary) => (
                <SpaceTile
                  key={summary.space.id}
                  name={summary.space.name}
                  count={summary.count}
                  color={summary.space.color}
                  onPress={() => router.push({ pathname: '/space/[id]', params: { id: summary.space.id } })}
                  accessibilityLabel={`${summary.space.name}, ${summary.count} cards${summary.openTasks ? `, ${summary.openTasks} open tasks` : ''}`}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </Canvas>
  );
};

const styles = StyleSheet.create({
  scroll: { paddingTop: 4, paddingBottom: 40, paddingHorizontal: 20, gap: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
});
