import { useMemo } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Shapes } from 'lucide-react-native';
import { spaceFeed } from '../../data/journal';
import { useJournal } from '../../data/useJournal';
import { Composer } from '../../journal/Composer';
import { JournalFeed } from '../../journal/JournalFeed';
import { useComposerToasts } from '../../journal/useComposerToasts';
import { useEntryActions } from '../../journal/useEntryActions';
import { TasksButton } from '../../tasks/TasksButton';
import { alpha } from '../../theme/palette';
import { useTheme } from '../../theme/theme';
import { Canvas } from '../../ui/Canvas';
import { FeedError, FeedSkeleton } from '../../ui/FeedStates';
import { Placeholder } from '../../ui/Placeholder';
import { Button } from '../../ui/Pressable';
import { StackHeader } from '../../ui/StackHeader';
import { PinnedSites } from '../../spaces/PinnedSites';

const countFmt = new Intl.NumberFormat();

/**
 * A space's board (decision 14B, phone form): its pinned sites on top, the
 * space's own Journal (jots written there and everything filed there, core's
 * feed) with the composer filing into it (core's withDefaultSpace), and its
 * open tasks one press away. Counts and pins are core's spaceBoard.
 */
export default function SpaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const router = useRouter();
  const { journal, isLoading, error, refreshing, refresh } = useJournal();
  const actions = useEntryActions();
  const placeToasts = useComposerToasts();
  const space = journal?.spaces.find((s) => s.id === id);
  const scoped = useMemo(() => (journal && space ? spaceFeed(journal, space.id) : null), [journal, space]);
  const spaceTasks = useMemo(() => (scoped ? [...scoped.board.openTasks, ...scoped.board.doneTasks] : []), [scoped]);
  const n = scoped?.board.total ?? 0;

  if (journal && !space) {
    return (
      <Canvas>
        <StackHeader />
        <View style={styles.center}>
          <Placeholder
            icon={<Shapes size={26} color={t.palette.onAccent} strokeWidth={2} />}
            title="This space isn’t here anymore"
            body="It may have been deleted on another device."
          >
            <Button label="All spaces" onPress={() => router.replace('/spaces')} />
          </Placeholder>
        </View>
      </Canvas>
    );
  }

  return (
    <Canvas>
      <StackHeader
        title={space?.name}
        subtitle={scoped ? `${countFmt.format(n)} ${n === 1 ? 'entry' : 'entries'}` : undefined}
        lead={
          space && (
            <View
              style={[styles.swatch, { backgroundColor: space.color, boxShadow: `${t.objectShadow}, 0 2px 8px -3px ${alpha(space.color, 0.7)}` }]}
              accessibilityElementsHidden
            />
          )
        }
        trailing={space && <TasksButton tasks={spaceTasks} space={space.id} />}
      />
      {scoped && scoped.board.pinned.length > 0 && <PinnedSites links={scoped.board.pinned} onOpen={actions.openLink} />}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        {isLoading ? (
          <FeedSkeleton />
        ) : error && !journal ? (
          <FeedError error={error} onRetry={refresh} />
        ) : scoped && n === 0 ? (
          <View style={styles.center}>
            <Placeholder
              icon={<Shapes size={26} color={t.palette.onAccent} strokeWidth={2} />}
              title={`Nothing in ${space?.name} yet`}
              body={`Write below and it lands here. Anywhere else, type @${space?.name} to file something in it.`}
            />
          </View>
        ) : scoped && journal ? (
          <JournalFeed parts={scoped.feed} spaces={journal.spaces} filer={journal.filer} refreshing={refreshing} onRefresh={refresh} />
        ) : null}
        {journal && space && (
          <Composer spaces={journal.spaces} filer={journal.filer} onSubmit={actions.compose} onTop={placeToasts} space={space} />
        )}
      </KeyboardAvoidingView>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center' },
  swatch: { width: 22, height: 22, borderRadius: 7 },
});
