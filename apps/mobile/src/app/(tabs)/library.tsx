import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { BookOpen, Search, SearchX, X } from 'lucide-react-native';
import type { SourceKey } from '@memex/core';
import type { LinkItem } from '../../data/library';
import { useLibrary } from '../../data/useLibrary';
import { LibraryCard } from '../../library/LibraryCard';
import { typeRole, useTheme } from '../../theme/theme';
import { Canvas } from '../../ui/Canvas';
import { FeedError, FeedSkeleton } from '../../ui/FeedStates';
import { FilterChip } from '../../ui/FilterChip';
import { Placeholder } from '../../ui/Placeholder';
import { Button } from '../../ui/Pressable';
import { ScreenHeader } from '../../ui/ScreenHeader';

/*
 * The Library (ROADMAP Phase 6: masonry grid): every saved link as a
 * two-column masonry of pictures and text cards, newest saved first. Source
 * chips (core's source rules, like the web's From X / Pinterest / YouTube
 * tabs) and search narrow it; it loads a page at a time as you scroll.
 */

const countFmt = new Intl.NumberFormat();
const GUTTER = 13;

export default function LibraryScreen() {
  const t = useTheme();
  const { palette } = t;
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [source, setSource] = useState<SourceKey | null>(null);
  const [search, setSearch] = useState('');
  const query = useMemo(() => ({ source, search }), [source, search]);
  const library = useLibrary(query);
  const columnWidth = Math.floor((width - GUTTER * 2) / 2) - 8;

  const open = useCallback((id: string) => router.push({ pathname: '/link/[id]', params: { id } }), [router]);
  const renderItem: ListRenderItem<LinkItem> = useCallback(
    ({ item }) => <LibraryCard item={item} width={columnWidth} onOpen={open} />,
    [columnWidth, open],
  );

  const filtered = Boolean(source || search.trim());
  const subtitle = library.isLoading || library.unavailable
    ? undefined
    : filtered
      ? `${countFmt.format(library.matching)} of ${countFmt.format(library.total)} links`
      : `${countFmt.format(library.total)} links`;

  return (
    <Canvas>
      <ScreenHeader title="Library" subtitle={subtitle} />
      <View style={styles.controls}>
        <View style={[styles.search, { backgroundColor: palette.well, borderRadius: t.radius.l }]}>
          <Search size={17} color={palette.muted} strokeWidth={2} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search links…"
            placeholderTextColor={palette.faint}
            selectionColor={palette.accent}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="never"
            accessibilityLabel="Search the Library"
            style={[typeRole('m'), styles.searchInput, { color: palette.ink }]}
          />
          {search ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => setSearch('')}>
              <X size={17} color={palette.muted} strokeWidth={2.25} />
            </Pressable>
          ) : null}
        </View>
        {library.tabs.length > 2 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
            {library.tabs.map((tab) => (
              <FilterChip
                key={tab.key ?? 'all'}
                label={tab.label}
                count={tab.count}
                on={source === tab.key}
                onPress={() => setSource(tab.key === source ? null : tab.key)}
              />
            ))}
          </ScrollView>
        )}
      </View>

      {library.isLoading ? (
        <FeedSkeleton />
      ) : library.unavailable ? (
        <FeedError error={library.error} onRetry={library.refresh} title="Couldn’t load your Library" retrying={library.refreshing} />
      ) : library.total === 0 ? (
        <View style={styles.center}>
          <Placeholder
            icon={<BookOpen size={26} color={palette.onAccent} strokeWidth={2} />}
            title="Your Library is empty"
            body="Links you save in the Journal, with the extension or from X, Pinterest and YouTube collect here as a grid."
          >
            <Button label="Go to the Journal" onPress={() => router.navigate('/')} />
          </Placeholder>
        </View>
      ) : library.matching === 0 ? (
        <View style={styles.center}>
          <Placeholder
            icon={<SearchX size={26} color={palette.onAccent} strokeWidth={2} />}
            title={search.trim() ? `Nothing matches “${search.trim()}”` : 'Nothing from here yet'}
            body="Try another word or source."
          >
            <Button
              label="Show everything"
              onPress={() => {
                setSearch('');
                setSource(null);
              }}
            />
          </Placeholder>
        </View>
      ) : (
        <FlashList
          data={library.items}
          masonry
          numColumns={2}
          renderItem={renderItem}
          keyExtractor={(item) => item.key}
          onEndReached={library.loadMore}
          onEndReachedThreshold={0.6}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.grid}
          refreshControl={<RefreshControl refreshing={library.refreshing} onRefresh={library.refresh} tintColor={palette.muted} />}
          ListFooterComponent={library.hasMore ? <ActivityIndicator style={styles.more} color={palette.muted} accessibilityLabel="Loading more…" /> : null}
          accessibilityLabel="Library"
          testID="library-grid"
        />
      )}
    </Canvas>
  );
}

const styles = StyleSheet.create({
  controls: { gap: 10, paddingBottom: 8 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 17, paddingHorizontal: 12, minHeight: 44 },
  searchInput: { flex: 1, paddingVertical: 10 },
  chips: { gap: 8, paddingHorizontal: 17, paddingVertical: 4 },
  grid: { paddingHorizontal: GUTTER - 4, paddingTop: 4, paddingBottom: 24 },
  more: { marginVertical: 17 },
  center: { flex: 1, justifyContent: 'center', paddingBottom: 60 },
});
