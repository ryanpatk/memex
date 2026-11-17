import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { BookOpen, Search, SearchX, X } from 'lucide-react-native';
import { getHostname, getLinkTitle, sourceOf, type JournalSpace } from '@memex/core';
import { pictureRatio, type LinkItem } from '../data/library';
import { useJournal } from '../data/useJournal';
import { useLibrary } from '../data/useLibrary';
import { AccountButton } from '../ui/AccountButton';
import { Canvas } from '../ui/Canvas';
import { FeedError, FeedSkeleton } from '../ui/FeedStates';
import { Placeholder } from '../ui/Placeholder';
import { ScreenHeader } from '../ui/ScreenHeader';
import { MemoryCard, type CardLabel } from './MemoryCard';
import { MoldedButton, CardsRoundButton } from './Molded';
import { SpacePills } from './SpacePills';
import { useCards } from './useCards';
import { captureStore } from './capture';

/*
 * Cards (the Library renamed, m01): one column of memory cards, newest saved
 * first. The hero carries the count (Cards²⁴⁸); ⌕ opens the search field;
 * space pills under the hero narrow to one space (the chosen pill fills with
 * its colour). Each card's label strip names its space. Tap opens the card.
 */

const UNFILED: CardLabel = { name: null, color: null };

const LinkCard = ({ item, label, onOpen }: { item: LinkItem; label: CardLabel; onOpen: (id: string) => void }) => {
  const [failed, setFailed] = useState(false);
  const link = item.link;
  const title = getLinkTitle(link);
  const source = sourceOf(link);
  const host = getHostname(link.url).replace(/^www\./, '');
  const ratio = failed ? null : pictureRatio(link);
  return (
    <View style={styles.cell}>
      <MemoryCard
        kind={ratio ? 'picture' : 'link'}
        title={title}
        label={label}
        meta={source.key === 'web' ? host : source.key === 'pinterest' ? 'pinterest' : source.label}
        picture={ratio && link.preview_image_url ? { uri: link.preview_image_url, ratio: Math.min(ratio, 1.1), key: link.id } : undefined}
        favicon={{ uri: link.favicon_url, letter: host.slice(0, 1).toUpperCase() }}
        onPress={() => onOpen(link.id)}
        onPictureError={() => setFailed(true)}
        accessibilityLabel={`${title}, ${label.name ?? 'Unfiled'}, ${source.key === 'web' ? host : source.label}`}
        testID={`library-card-${link.id}`}
      />
    </View>
  );
};

export const CardsLibrary = () => {
  const c = useCards();
  const router = useRouter();
  const { journal } = useJournal();
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [space, setSpace] = useState<string | null>(null);

  // Link id → the spaces it's filed in (from the Journal's entries)
  const spacesByLink = useMemo(() => {
    const map = new Map<string, JournalSpace[]>();
    journal?.entries.forEach((entry) => {
      if (entry.kind === 'link') map.set(entry.link.id, entry.spaces);
    });
    return map;
  }, [journal]);

  const linkIds = useMemo(() => {
    if (!space) return null;
    const ids = new Set<string>();
    spacesByLink.forEach((spaces, id) => {
      if (spaces.some((s) => s.id === space)) ids.add(id);
    });
    return ids;
  }, [space, spacesByLink]);

  const query = useMemo(() => ({ source: null, search, linkIds }), [linkIds, search]);
  const library = useLibrary(query);

  const labelFor = useCallback(
    (id: string): CardLabel => {
      const spaces = spacesByLink.get(id) ?? [];
      if (!spaces.length) return UNFILED;
      const first = spaces.find((s) => s.id === space) ?? spaces[0];
      return { name: first.name, color: first.color, extra: spaces.length - 1 };
    },
    [space, spacesByLink],
  );

  const open = useCallback((id: string) => router.push({ pathname: '/link/[id]', params: { id } }), [router]);
  const renderItem: ListRenderItem<LinkItem> = useCallback(
    ({ item }) => <LinkCard item={item} label={labelFor(item.link.id)} onOpen={open} />,
    [labelFor, open],
  );

  const chosen = journal?.spaces.find((s) => s.id === space);
  const filtered = Boolean(space || search.trim());

  return (
    <Canvas>
      <ScreenHeader
        title="Cards"
        hero={chosen?.name ?? 'Cards'}
        count={library.isLoading || library.unavailable ? undefined : filtered ? library.matching : library.total}
        trailing={
          <View style={styles.trailing}>
            <CardsRoundButton
              label={searching ? 'Close search' : 'Search cards'}
              onPress={() => {
                if (searching) setSearch('');
                setSearching((v) => !v);
              }}
            >
              {searching ? <X size={20} color={c.colors.ink} strokeWidth={2.75} /> : <Search size={20} color={c.colors.ink} strokeWidth={2.75} />}
            </CardsRoundButton>
            <AccountButton />
          </View>
        }
      />
      {searching && (
        <View style={[styles.search, { backgroundColor: c.colors.paper, boxShadow: c.cardShadow }]}>
          <Search size={20} color={c.colors.muted} strokeWidth={2.5} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            autoFocus
            placeholder="Search cards…"
            placeholderTextColor={c.colors.faint}
            selectionColor={c.colors.primary}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            accessibilityLabel="Search cards"
            style={[c.type.body, styles.searchInput, { color: c.colors.ink }]}
          />
          {search ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={12} onPress={() => setSearch('')}>
              <X size={20} color={c.colors.muted} strokeWidth={2.5} />
            </Pressable>
          ) : null}
        </View>
      )}
      {journal && journal.spaces.length > 0 && (
        <SpacePills spaces={journal.spaces} selected={space} onSelect={setSpace} />
      )}

      {library.isLoading ? (
        <FeedSkeleton />
      ) : library.unavailable ? (
        <FeedError error={library.error} onRetry={library.refresh} title="Couldn’t load your cards" retrying={library.refreshing} />
      ) : library.total === 0 ? (
        <View style={styles.center}>
          <Placeholder
            icon={<BookOpen size={26} color="#ffffff" strokeWidth={2.5} />}
            title="Your first card goes here"
            body="Links you save in the Journal, with the extension or from X, Pinterest and YouTube become cards."
          >
            <MoldedButton variant="primary" label="Save something" onPress={() => captureStore.open()} />
          </Placeholder>
        </View>
      ) : library.matching === 0 ? (
        <View style={styles.center}>
          <Placeholder
            icon={<SearchX size={26} color="#ffffff" strokeWidth={2.5} />}
            title={search.trim() ? `Nothing matches “${search.trim()}”` : `Nothing in ${chosen?.name ?? 'this space'} yet`}
            body="Try another word, or show every card."
          >
            <MoldedButton
              label="Show everything"
              onPress={() => {
                setSearch('');
                setSpace(null);
              }}
            />
          </Placeholder>
        </View>
      ) : (
        <FlashList
          data={library.items}
          renderItem={renderItem}
          keyExtractor={(item) => item.key}
          onEndReached={library.loadMore}
          onEndReachedThreshold={0.6}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={library.refreshing} onRefresh={library.refresh} tintColor={c.colors.muted} />}
          ListFooterComponent={library.hasMore ? <ActivityIndicator style={styles.more} color={c.colors.muted} accessibilityLabel="Loading more…" /> : null}
          accessibilityLabel="Cards"
          testID="library-grid"
        />
      )}
    </Canvas>
  );
};

const styles = StyleSheet.create({
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginBottom: 6, paddingHorizontal: 20, height: 60, borderRadius: 30 },
  searchInput: { flex: 1, paddingVertical: 10 },
  cell: { paddingBottom: 18 },
  list: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 },
  more: { marginVertical: 17 },
  center: { flex: 1, justifyContent: 'center', paddingBottom: 60 },
});
