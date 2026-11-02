import { useCallback } from 'react';
import { FlatList, RefreshControl, StyleSheet, View, type ListRenderItem } from 'react-native';
import type { Part } from '@memex/core';
import { useTheme } from '../theme/theme';
import { FeedPart } from './parts';

/*
 * The feed, chat-style (decision 1: newest at the bottom). An inverted list
 * opens at the newest entry; pulling past the newest end refreshes.
 */

export const JournalFeed = ({
  parts,
  refreshing,
  onRefresh,
}: {
  parts: Part[];
  refreshing: boolean;
  onRefresh: () => void;
}) => {
  const { palette } = useTheme();
  const renderItem: ListRenderItem<Part> = useCallback(({ item }) => <FeedPart part={item} />, []);
  return (
    <FlatList
      inverted
      data={parts}
      keyExtractor={(p) => p.id}
      renderItem={renderItem}
      ItemSeparatorComponent={Gap}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.muted} />}
      initialNumToRender={16}
      windowSize={9}
      accessibilityLabel="Journal"
    />
  );
};

const Gap = () => <View style={styles.gap} />;

const styles = StyleSheet.create({
  // Inverted: paddingTop sits at the bottom of the screen, above the tab bar.
  content: { paddingHorizontal: 17, paddingTop: 17, paddingBottom: 8 },
  gap: { height: 10 },
});
