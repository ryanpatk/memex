import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { BookOpen, Search, SearchX, X } from 'lucide-react-native';
import { getHostname, getLinkTitle, sourceOf, type Entry } from '@memex/core';
import { pictureRatio, type LinkItem } from '../data/library';
import { useJournal } from '../data/useJournal';
import { useLibrary } from '../data/useLibrary';
import { showEntryMenu } from '../journal/entryMenu';
import { useEntryActions } from '../journal/useEntryActions';
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
 * first. The hero carries the count (Cards²⁴⁸); space pills under it narrow
 * to one space (the chosen pill fills with its colour). Each card's label
 * strip names its space. Tap opens the card; long-press is its menu (m08:
 * File in, Open, Delete). ⌕ swaps the pills for the search field (m09): it
 * says how many match and offers to save what you typed as a jot.
 */

type LinkEntry = Extract<Entry, { kind: 'link' }>;

const UNFILED: CardLabel = { name: null, color: null };
const countFmt = new Intl.NumberFormat();

const LinkCard = ({
  item,
  label,
  onOpen,
  onMenu,
}: {
  item: LinkItem;
  label: CardLabel;
  onOpen: (id: string) => void;
  onMenu?: (id: string) => void;
}) => {
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
        onLongPress={onMenu ? () => onMenu(link.id) : undefined}
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
  const actions = useEntryActions();
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const [space, setSpace] = useState<string | null>(null);

  // Link id → its Journal entry (the spaces it's filed in, its menu)
  const entryByLink = useMemo(() => {
    const map = new Map<string, LinkEntry>();
    journal?.entries.forEach((entry) => {
      if (entry.kind === 'link') map.set(entry.link.id, entry);
    });
    return map;
  }, [journal]);

  const linkIds = useMemo(() => {
    if (!space) return null;
    const ids = new Set<string>();
    entryByLink.forEach((entry, id) => {
      if (entry.spaces.some((s) => s.id === space)) ids.add(id);
    });
    return ids;
  }, [space, entryByLink]);

  const query = useMemo(() => ({ source: null, search, linkIds }), [linkIds, search]);
  const library = useLibrary(query);

  const labelFor = useCallback(
    (id: string): CardLabel => {
      const spaces = entryByLink.get(id)?.spaces ?? [];
      if (!spaces.length) return UNFILED;
      const first = spaces.find((s) => s.id === space) ?? spaces[0];
      return { name: first.name, color: first.color, extra: spaces.length - 1 };
    },
    [space, entryByLink],
  );

  const open = useCallback((id: string) => router.push({ pathname: '/link/[id]', params: { id } }), [router]);
  const menu = useCallback(
    (id: string) => {
      const entry = entryByLink.get(id);
      if (entry) showEntryMenu(entry, getLinkTitle(entry.link), journal?.spaces ?? [], actions);
    },
    [actions, entryByLink, journal?.spaces],
  );
  const renderItem: ListRenderItem<LinkItem> = useCallback(
    ({ item }) => <LinkCard item={item} label={labelFor(item.link.id)} onOpen={open} onMenu={entryByLink.has(item.link.id) ? menu : undefined} />,
    [entryByLink, labelFor, menu, open],
  );

  const chosen = journal?.spaces.find((s) => s.id === space);
  const typed = search.trim();
  const filtered = Boolean(space || typed);
  const closeSearch = () => {
    setSearch('');
    setSearching(false);
  };
  const saveTyped = () => captureStore.open({ text: typed, kind: 'jot' });
  const saveAsJot = typed ? <MoldedButton label={`Save “${typed}” as a jot`} onPress={saveTyped} wide /> : null;

  return (
    <Canvas>
      <ScreenHeader
        title="Cards"
        hero={chosen?.name ?? 'Cards'}
        count={searching || library.isLoading || library.unavailable ? undefined : filtered ? library.matching : library.total}
        trailing={
          searching ? (
            <CardsRoundButton label="Close search" onPress={closeSearch}>
              <X size={20} color={c.colors.ink} strokeWidth={2.75} />
            </CardsRoundButton>
          ) : (
            <View style={styles.trailing}>
              <CardsRoundButton label="Search cards" onPress={() => setSearching(true)}>
                <Search size={20} color={c.colors.ink} strokeWidth={2.75} />
              </CardsRoundButton>
              <AccountButton />
            </View>
          )
        }
      />
      {searching ? (
        <View style={styles.searchBlock}>
          <View
            style={[
              styles.search,
              { backgroundColor: c.colors.paper, boxShadow: focused ? `0 0 0 4px ${c.colors.ring}, ${c.cardShadow}` : c.cardShadow },
            ]}
          >
            <Search size={20} color={c.colors.muted} strokeWidth={2.5} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
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
          {typed && !library.isLoading && !library.unavailable ? (
            <RNText style={[c.type.labelUi, styles.matches, { color: c.colors.muted, fontFamily: 'Inter_600SemiBold' }]} accessibilityLiveRegion="polite">
              {countFmt.format(library.matching)} {library.matching === 1 ? 'card' : 'cards'}
            </RNText>
          ) : null}
        </View>
      ) : (
        journal && journal.spaces.length > 0 && <SpacePills spaces={journal.spaces.filter((s) => !s.hidden || s.id === space)} selected={space} onSelect={setSpace} />
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
            body="Links you save with +, the extension, or from X, Pinterest and YouTube become cards."
          >
            <MoldedButton variant="primary" label="Save something" onPress={() => captureStore.open()} />
          </Placeholder>
        </View>
      ) : library.matching === 0 ? (
        <View style={styles.center}>
          <Placeholder
            icon={<SearchX size={26} color="#ffffff" strokeWidth={2.5} />}
            title={typed ? `Nothing matches “${typed}”` : `Nothing in ${chosen?.name ?? 'this space'} yet`}
            body={typed ? 'Try another word, or keep it as a jot.' : 'Try another space, or show every card.'}
          >
            {typed ? (
              <MoldedButton variant="primary" label={`Save “${typed}” as a jot`} onPress={saveTyped} />
            ) : (
              <MoldedButton label="Show everything" onPress={() => setSpace(null)} />
            )}
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
          ListFooterComponent={
            library.hasMore ? (
              <ActivityIndicator style={styles.more} color={c.colors.muted} accessibilityLabel="Loading more…" />
            ) : searching && saveAsJot ? (
              <View style={styles.footer}>{saveAsJot}</View>
            ) : null
          }
          accessibilityLabel="Cards"
          testID="library-grid"
        />
      )}
    </Canvas>
  );
};

const styles = StyleSheet.create({
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchBlock: { paddingHorizontal: 20, paddingTop: 6, gap: 10 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, height: 60, borderRadius: 30 },
  searchInput: { flex: 1, paddingVertical: 10 },
  matches: { paddingHorizontal: 4 },
  cell: { paddingBottom: 18 },
  list: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 40 },
  more: { marginVertical: 17 },
  footer: { paddingTop: 6 },
  center: { flex: 1, justifyContent: 'center', paddingBottom: 60 },
});
