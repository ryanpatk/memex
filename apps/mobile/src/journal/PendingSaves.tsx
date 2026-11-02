import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CloudOff, TriangleAlert } from 'lucide-react-native';
import { getHostname, type OutboxItem } from '@memex/core';
import { useOutboxItems, useOutboxOwner, useSaves } from '../data/DataProvider';
import { draftText } from '../data/saves';
import { alpha } from '../theme/palette';
import { useTheme } from '../theme/theme';
import { Button } from '../ui/Pressable';
import { Text } from '../ui/Text';
import { useToast } from '../ui/Toast';

/*
 * Saves kept on this phone because it couldn't reach memex: at the newest
 * end of the Journal, as paper with a dashed edge (not saved yet), each with
 * what's wrong and two actions. Retry sends it now; Discard drops the copy
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
  const t = useTheme();
  const { palette } = t;
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

  return (
    <View
      style={[
        styles.row,
        {
          borderRadius: t.radius.m,
          backgroundColor: palette.paper,
          borderColor: failed ? alpha(palette.error, 0.6) : alpha(palette.muted, 0.55),
        },
      ]}
      accessible={false}
      testID={`pending-${item.id}`}
    >
      <View style={styles.head} accessible accessibilityLabel={`${KIND[item.draft.kind]} not sent yet: ${text}. ${pendingStatus(item)}`}>
        {failed ? <TriangleAlert size={16} color={palette.error} strokeWidth={2} /> : <CloudOff size={16} color={palette.muted} strokeWidth={2} />}
        <View style={styles.text}>
          <Text size="xxs" weight="heavy" tone="muted">
            {KIND[item.draft.kind]}
            {host ? ` · ${host}` : ''}
            {where ? ` · ${where}` : ''}
          </Text>
          <Text size="s" numberOfLines={3}>
            {text}
          </Text>
          <Text size="xs" tone={failed ? 'error' : 'muted'} numberOfLines={2}>
            {pendingStatus(item)}
          </Text>
        </View>
      </View>
      <View style={styles.actions}>
        <Button compact variant="ghost" label="Discard" onPress={discard} accessibilityHint="Removes the copy kept on this phone" />
        <Button compact label="Retry" onPress={retry} accessibilityHint="Tries to save it now" />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  // Inverted feed: this sits under the newest entry, so its gap is on top.
  list: { gap: 10, paddingTop: 10 },
  row: { borderWidth: 1, borderStyle: 'dashed', padding: 12, gap: 8 },
  head: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  text: { flex: 1, minWidth: 0, gap: 2 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
