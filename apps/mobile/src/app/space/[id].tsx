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
import { Canvas } from '../../ui/Canvas';
import { FeedError, FeedSkeleton } from '../../ui/FeedStates';
import { Placeholder } from '../../ui/Placeholder';
import { Button } from '../../ui/Pressable';
import { StackHeader } from '../../ui/StackHeader';
import { PinnedSites } from '../../spaces/PinnedSites';
import { usePinMenu } from '../../spaces/usePinMenu';

const countFmt = new Intl.NumberFormat();

/**
 * A space's board (decision 14B, phone form): its pinned sites on top
 * (long-press one to move or unpin it), the
 * space's own Journal (jots written there and everything filed there, core's
 * feed) with the composer filing into it (core's withDefaultSpace), and its
 * open tasks one press away. Counts and pins are core's spaceBoard.
 */
export default function SpaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { journal, isLoading, unavailable, error, refreshing, refresh } = useJournal();
  const actions = useEntryActions();
  const placeToasts = useComposerToasts();
  const space = journal?.spaces.find((s) => s.id === id);
  const scoped = useMemo(() => (journal && space ? spaceFeed(journal, space.id) : null), [journal, space]);
  const spaceTasks = useMemo(() => (scoped ? [...scoped.board.openTasks, ...scoped.board.doneTasks] : []), [scoped]);
  const n = scoped?.board.total ?? 0;
  const pins = useMemo(() => scoped?.board.pinned ?? [], [scoped]);
  const positions = useMemo(
    () =>
      new Map(
        (journal?.linkMembership ?? [])
          .filter((row) => row.profile_id === id && row.is_super_favorite)
          .map((row) => [row.link_id, row.pin_position ?? null] as const),
      ),
    [id, journal],
  );
  const pinMenu = usePinMenu({ pins, spaceId: id ?? null, positions, onOpen: actions.openLink });

  // Gone only once everything loaded and it isn't there (not when it didn't load).
  if (journal && !unavailable && !space) {
    return (
      <Canvas>
        <StackHeader />
        <View style={styles.center}>
          <Placeholder
            icon={<Shapes />}
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
        band={space?.color}
        subtitle={
          scoped && !unavailable
            ? `${countFmt.format(n)} ${n === 1 ? 'card' : 'cards'} · ${countFmt.format(scoped.board.openTasks.length)} ${scoped.board.openTasks.length === 1 ? 'task' : 'tasks'}`
            : undefined
        }
        trailing={space && <TasksButton tasks={spaceTasks} space={space.id} />}
      />
      {pins.length > 0 && <PinnedSites links={pins} onOpen={actions.openLink} onLongPress={pinMenu.show} actionsFor={pinMenu.rows} />}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        {isLoading ? (
          <FeedSkeleton />
        ) : unavailable ? (
          <FeedError error={error} onRetry={refresh} title="Couldn’t load this space" retrying={refreshing} />
        ) : scoped && n === 0 ? (
          <View style={styles.center}>
            <Placeholder
              icon={<Shapes />}
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
});
