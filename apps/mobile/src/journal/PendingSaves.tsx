import { memo, useMemo } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import { LabelStrip } from '../cards/MemoryCard';
import * as Haptics from 'expo-haptics';
import { getHostname, type OutboxItem } from '@memex/core';
import { useOutboxItems, useOutboxOwner, useSaves } from '../data/DataProvider';
import { draftText } from '../data/saves';
import { useCards } from '../cards/useCards';
import { Button } from '../ui/Pressable';
import { useToast } from '../ui/Toast';

/*
 * Saves kept on this phone because it couldn't reach memex (m06): at the
 * newest end of the Journal, each a card whose label strip says “Not sent
 * yet” (red “Couldn’t save” once the server refused it), with two actions. Retry sends it now; Discard drops the copy
 * on the phone (with Undo) and never touches anything already saved. A save
 * being sent shows in the feed itself, so it leaves this list meanwhile.
 */

const KIND: Record<OutboxItem['draft']['kind'], string> = { jot: 'Jot', link: 'Link', note: 'Note', task: 'Task' };

const clip = (text: string, max = 40) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};

/** What the row says about where the save stands. */
export const pendingStatus = (item: OutboxItem) =>
  item.status === 'failed'
    ? `Couldn’t save: ${item.lastError ?? 'the server said no'}`
    : item.attempts > 1
      ? `Waiting for a connection · tried ${item.attempts} times`
      : 'Waiting for a connection';

/** The saves to show: the signed-in user's (or ownerless) ones not mid-send. */
export const visiblePending = (items: readonly OutboxItem[], owner: string | null) =>
  items.filter((item) => item.status !== 'sending' && (item.owner === null || item.owner === owner));

export const usePendingSaves = () => {
  const items = useOutboxItems();
  const owner = useOutboxOwner();
  return useMemo(() => visiblePending(items, owner), [items, owner]);
};

export const PendingSaves = memo(function PendingSaves({ items }: { items: readonly OutboxItem[] }) {
  if (!items.length) return null;
  return (
    <View style={styles.list} accessibilityLabel={`${items.length} not sent yet`} testID="pending-saves">
      {/* Inverted feed: the last child sits nearest the composer, so newest goes last. */}
      {items.map((item) => (
        <PendingRow key={item.id} item={item} />
      ))}
    </View>
  );
});

const PendingRow = ({ item }: { item: OutboxItem }) => {
  const c = useCards();
  const saves = useSaves();
  const toast = useToast();
  const failed = item.status === 'failed';
  const text = draftText(item.draft);
  const host = item.draft.kind === 'link' ? getHostname(item.draft.url).replace(/^www\./, '') : null;
  const where = item.draft.spaces.map((s) => s.name).join(', ');
  const label = clip(text);

  const discard = () => {
    const removed = saves.discard(item.id);
    if (!removed) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toast.show(`Discarded “${label}” from this phone.`, { action: { label: 'Undo', onPress: () => saves.restore(removed) } });
  };

  const retry = () => {
    void saves.retry(item.id);
  };

  // m06: a card whose label strip says it isn't sent yet (orange; red once refused)
  return (
    <View style={[styles.card, { backgroundColor: c.colors.paper, boxShadow: c.cardShadow }]} testID={`pending-${item.id}`}>
      <View accessible accessibilityLabel={`${KIND[item.draft.kind]} not sent yet: ${text}. ${pendingStatus(item)}`} style={styles.text}>
        <RNText style={[c.type.title, { fontSize: 21, lineHeight: 26, color: c.colors.ink }]} numberOfLines={3}>
          {text}
        </RNText>
        {failed || host || where ? (
          <RNText style={[c.type.labelUi, { color: failed ? c.colors.error : c.colors.muted }]} numberOfLines={2}>
            {failed ? pendingStatus(item) : [host, where].filter(Boolean).join(' · ')}
          </RNText>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Button compact variant="primary" label="Retry" onPress={retry} accessibilityHint="Tries to save it now" />
        <Button compact variant="ghost" label="Discard" onPress={discard} accessibilityHint="Removes the copy kept on this phone" />
      </View>
      <View style={styles.strip}>
        <LabelStrip
          label={{ name: failed ? 'Couldn’t save' : 'Not sent yet', color: failed ? c.colors.error : c.extra.waiting }}
          meta={failed ? KIND[item.draft.kind].toLowerCase() : item.attempts > 1 ? `tried ${item.attempts} times` : 'no connection'}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Inverted feed: this sits under the newest entry, so its gap is on top.
  list: { gap: 12, paddingTop: 12 },
  card: { borderRadius: 28, paddingTop: 20, paddingHorizontal: 20, gap: 14, overflow: 'hidden' },
  text: { gap: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  strip: { marginHorizontal: -20 },
});
