import { useCallback, useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, View, type ListRenderItem } from 'react-native';
import type { Filer, JournalSpace, OutboxItem, Part } from '@memex/core';
import { useTheme } from '../theme/theme';
import { FeedContext, FeedPart } from './parts';
import { PendingSaves } from './PendingSaves';
import { useEntryActions } from './useEntryActions';

/*
 * The feed, chat-style (decision 1: newest at the bottom). An inverted list
 * opens at the newest entry; pulling past the newest end refreshes. Dragging
 * the feed tucks the keyboard away.
 */

export const JournalFeed = ({
  parts,
  spaces,
  filer,
  refreshing,
  onRefresh,
  pending = [],
}: {
  parts: Part[];
  /** Saves kept on the phone, shown at the newest end. */
  pending?: readonly OutboxItem[];
  spaces: JournalSpace[];
  filer?: Filer;
  refreshing: boolean;
  onRefresh: () => void;
}) => {
  const { palette } = useTheme();
  const actions = useEntryActions();
  const context = useMemo(() => ({ actions, filer, spaces }), [actions, filer, spaces]);
  const renderItem: ListRenderItem<Part> = useCallback(({ item }) => <FeedPart part={item} />, []);
  return (
    <FeedContext.Provider value={context}>
      <FlatList
        inverted
        data={parts}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        ItemSeparatorComponent={Gap}
        // Inverted: the header sits at the newest end, by the composer.
        ListHeaderComponent={pending.length ? <PendingSaves items={pending} /> : undefined}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.muted} />}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        initialNumToRender={16}
        windowSize={9}
        accessibilityLabel="Journal"
        testID="journal-feed"
      />
    </FeedContext.Provider>
  );
};

const Gap = () => <View style={styles.gap} />;

const styles = StyleSheet.create({
  // Inverted: paddingTop sits at the bottom of the screen, above the composer.
  content: { paddingHorizontal: 17, paddingTop: 17, paddingBottom: 8 },
  gap: { height: 10 },
});
