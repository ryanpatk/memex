import { useCallback, useMemo } from 'react';
import { FlatList, RefreshControl, StyleSheet, View, type ListRenderItem } from 'react-native';
import type { Filer, JournalSpace, Part } from '@memex/core';
import { useTheme } from '../theme/theme';
import { FeedContext, FeedPart } from './parts';
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
}: {
  parts: Part[];
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
