import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View, type ListRenderItem } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CloudOff, Inbox as InboxIcon } from 'lucide-react-native';
import type { FileableEntry, Suggestion } from '@memex/core';
import type { ProposalView } from '../../data/inbox';
import { useActions } from '../../data/DataProvider';
import { useInbox } from '../../data/useInbox';
import { ProposalCard } from '../../inbox/ProposalCard';
import { SuggestionCard } from '../../inbox/SuggestionCard';
import { useEntryActions } from '../../journal/useEntryActions';
import { useTheme } from '../../theme/theme';
import { Canvas } from '../../ui/Canvas';
import { FeedError, FeedSkeleton } from '../../ui/FeedStates';
import { Paper } from '../../ui/Paper';
import { Placeholder } from '../../ui/Placeholder';
import { Button } from '../../ui/Pressable';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { Text } from '../../ui/Text';
import { useToast } from '../../ui/Toast';

/*
 * The Inbox (CONTEXT.md): what's waiting for you. Agents' proposals first
 * (approve or reject; nothing changes until you approve), then filing
 * suggestions for recent unfiled things (decision 13: File, or Not now,
 * each with Undo). Unfiled is a finished state, so an empty Inbox is the
 * normal one.
 */

type Item =
  | { kind: 'head'; id: string; title: string; lede: string }
  | { kind: 'proposalsFailed'; id: string }
  | { kind: 'proposal'; id: string; view: ProposalView }
  | { kind: 'suggestion'; id: string; entry: FileableEntry; suggestion: Suggestion };

const countFmt = new Intl.NumberFormat();

export default function InboxScreen() {
  const t = useTheme();
  const toast = useToast();
  const actions = useActions();
  const entryActions = useEntryActions();
  const { journal, proposals, suggestions, count, isLoading, unavailable, error, proposalsFailed, retryingProposals, refreshing, refresh, retryProposals } = useInbox();
  const [deciding, setDeciding] = useState<{ id: string; decision: 'apply' | 'reject' } | null>(null);

  const decide = async (view: ProposalView, decision: 'apply' | 'reject') => {
    setDeciding({ id: view.proposal.id, decision });
    try {
      await actions.decideProposal(view.proposal, view.target, decision);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(decision === 'apply' ? `Approved ${view.proposal.client_name}’s change.` : `Rejected ${view.proposal.client_name}’s proposal.`);
    } catch (e) {
      console.warn('Deciding a proposal failed:', e);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show(e instanceof Error && /no longer exists|already decided/.test(e.message) ? e.message : 'Couldn’t do that. Try again.', { tone: 'error' });
    } finally {
      setDeciding(null);
    }
  };

  const items: Item[] = [
    // Agents' proposals didn't load: say so, rather than “Nothing waiting”.
    ...(proposalsFailed ? [{ kind: 'proposalsFailed' as const, id: 'proposals-failed' }] : []),
    ...(proposals.length
      ? [
          { kind: 'head' as const, id: 'head:agents', title: 'From agents', lede: 'Changes an agent asked to make. Nothing changes until you approve; rejected ones are kept as a record.' },
          ...proposals.map((view) => ({ kind: 'proposal' as const, id: `proposal:${view.proposal.id}`, view })),
        ]
      : []),
    ...(suggestions.length
      ? [
          { kind: 'head' as const, id: 'head:filing', title: 'Filing suggestions', lede: 'Recent saves with a likely space. File them, or leave them be: unfiled is fine.' },
          ...suggestions.map(({ entry, suggestion }) => ({ kind: 'suggestion' as const, id: entry.id, entry, suggestion })),
        ]
      : []),
  ];

  const renderItem: ListRenderItem<Item> = ({ item }) => {
    switch (item.kind) {
      case 'head':
        return (
          <View style={styles.head}>
            <Text size="xs" weight="heavy" tone="soft" accessibilityRole="header">
              {item.title}
            </Text>
            <Text size="xs" tone="muted">
              {item.lede}
            </Text>
          </View>
        );
      case 'proposalsFailed':
        return (
          <Paper level="s" radius={t.radius.l} style={styles.failed}>
            <CloudOff size={18} color={t.palette.muted} strokeWidth={2} />
            <Text size="s" tone="soft" style={styles.failedText}>
              Couldn’t load agents’ proposals
            </Text>
            <Button label="Try again" compact loading={retryingProposals} onPress={retryProposals} />
          </Paper>
        );
      case 'proposal':
        return (
          <ProposalCard
            view={item.view}
            busy={deciding?.id === item.view.proposal.id ? deciding.decision : null}
            onDecide={(decision) => void decide(item.view, decision)}
          />
        );
      case 'suggestion': {
        const { entry, suggestion } = item;
        return (
          <SuggestionCard
            entry={entry}
            suggestion={suggestion}
            onFile={() => void entryActions.file(entry, suggestion.space)}
            onDismiss={() => entryActions.dismissSuggestion(entry)}
            onOpen={
              entry.kind === 'link' ? () => entryActions.openLink(entry.link.id) : entry.kind === 'note' ? () => entryActions.openNote(entry.note.id) : undefined
            }
          />
        );
      }
    }
  };

  return (
    <Canvas>
      <ScreenHeader title="Inbox" subtitle={journal && !unavailable ? (count ? `${countFmt.format(count)} waiting` : proposalsFailed ? undefined : 'All caught up') : undefined} />
      {isLoading ? (
        <FeedSkeleton />
      ) : unavailable ? (
        <FeedError error={error} onRetry={() => void refresh()} title="Couldn’t load your Inbox" retrying={refreshing} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.list, !items.length && styles.emptyList]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={t.palette.muted} />}
          ListEmptyComponent={
            <Placeholder
              icon={<InboxIcon size={26} color={t.palette.onAccent} strokeWidth={2} />}
              title="Nothing waiting"
              body="Unfiled is a finished state. When memex has a likely space for something new, or an agent asks to change something, it waits here."
            />
          }
          accessibilityLabel="Inbox"
          testID="inbox-list"
        />
      )}
    </Canvas>
  );
}

const styles = StyleSheet.create({
  list: { paddingTop: 4, paddingBottom: 33, paddingHorizontal: 17, gap: 10 },
  emptyList: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 0 },
  head: { gap: 2, paddingHorizontal: 4, paddingTop: 6 },
  failed: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 8, paddingVertical: 8 },
  failedText: { flex: 1, minWidth: 0 },
});
