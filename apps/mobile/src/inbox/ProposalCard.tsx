import { useState } from 'react';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { compactDiff, type DiffLine } from '@memex/core/agent';
import { relativeTime } from '@memex/core';
import { LabelStrip } from '../cards/MemoryCard';
import { useCards } from '../cards/useCards';
import type { ProposalView } from '../data/inbox';
import { Button } from '../ui/Pressable';
import { SpaceChip } from '../ui/SpaceChip';

/*
 * One agent proposal (s10, m03; web: ProposalRow) as a memory card: the
 * agent's badge and what it wants, the item's title, the change (core's
 * proposalFields: inserted text green, removed red and struck; before →
 * after for the rest), its reason, Approve and Reject, and the item's label
 * strip. Nothing changes until Approve; Reject keeps the record.
 */

const DIFF_LINES = 12;
const VERB = { file: 'wants to file', append: 'wants to add', edit: 'wants to edit' } as const;

const Diff = ({ lines }: { lines: DiffLine[] }) => {
  const c = useCards();
  const [all, setAll] = useState(false);
  const compact = compactDiff(lines);
  const shown = all ? compact : compact.slice(0, DIFF_LINES);
  return (
    <View style={[styles.diff, { backgroundColor: c.colors.well }]} accessibilityLabel="Changes to the text">
      {shown.map((line, i) =>
        line.op === 'skip' ? (
          <RNText key={i} style={[c.type.labelUi, { color: c.colors.faint }]}>
            {`⋯ ${line.count} unchanged ${line.count === 1 ? 'line' : 'lines'}`}
          </RNText>
        ) : (
          <RNText
            key={i}
            accessibilityLabel={`${line.op === 'add' ? 'Added: ' : line.op === 'del' ? 'Removed: ' : ''}${line.text}`}
            style={[c.type.body, styles.diffLine, { color: c.colors.ink }]}
          >
            <RNText
              style={
                line.op === 'add'
                  ? { backgroundColor: c.extra.insBg, color: c.extra.insInk }
                  : line.op === 'del'
                    ? { backgroundColor: c.extra.delBg, color: c.extra.delInk, textDecorationLine: 'line-through' }
                    : undefined
              }
            >
              {line.text || ' '}
            </RNText>
          </RNText>
        ),
      )}
      {compact.length > DIFF_LINES && (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: all }} onPress={() => setAll((v) => !v)} hitSlop={10}>
          <RNText style={[c.type.label, styles.more, { color: c.colors.primaryInk }]}>{all ? 'Show less' : `Show all ${compact.length} lines`}</RNText>
        </Pressable>
      )}
    </View>
  );
};

export const ProposalCard = ({
  view,
  busy,
  onDecide,
  now,
}: {
  view: ProposalView;
  busy: 'apply' | 'reject' | null;
  onDecide: (decision: 'apply' | 'reject') => void;
  now?: number;
}) => {
  const c = useCards();
  const { proposal, title, space, spaces, fields, stale, what, canApply } = view;
  const first = spaces[0];
  return (
    <View style={[styles.card, { backgroundColor: c.colors.paper, boxShadow: c.cardShadow }]} testID={`proposal-${proposal.id}`}>
      <View style={styles.who}>
        <View style={[styles.agent, { backgroundColor: c.colors.agentBg }]}>
          <RNText style={[c.type.label, { color: c.colors.agent }]} numberOfLines={1}>
            ✦ {proposal.client_name}
          </RNText>
        </View>
        <RNText style={[c.type.labelUi, { color: c.colors.muted }]} numberOfLines={1}>
          {VERB[proposal.kind]} · {relativeTime(proposal.created_at, now)}
        </RNText>
      </View>
      {title !== null ? (
        <RNText style={[c.type.h3, { color: c.colors.ink }]} numberOfLines={3}>
          {title}
        </RNText>
      ) : (
        <RNText style={[c.type.body, { color: c.colors.muted }]}>This item no longer exists.</RNText>
      )}
      {proposal.kind === 'file' && (
        <View style={styles.what}>
          <RNText style={[c.type.labelUi, { color: c.colors.muted }]}>
            {what}
            {!space ? ' a space that no longer exists' : ''}
          </RNText>
          {space && <SpaceChip space={space} />}
        </View>
      )}
      {fields.map((f) =>
        f.field === 'text' ? (
          <Diff key={f.field} lines={f.lines} />
        ) : (
          <View
            key={f.field}
            style={[styles.diff, { backgroundColor: c.colors.well }]}
            accessible
            accessibilityLabel={`${f.label}: ${f.before || 'empty'} becomes ${f.after || 'empty'}`}
          >
            <RNText style={[c.type.labelUi, { color: c.colors.muted }]}>{f.label}</RNText>
            <RNText style={[c.type.body, { color: c.colors.ink }]}>
              <RNText style={{ backgroundColor: c.extra.delBg, color: c.extra.delInk, textDecorationLine: 'line-through' }}>{f.before || 'empty'}</RNText>
              {'  →  '}
              <RNText style={{ backgroundColor: c.extra.insBg, color: c.extra.insInk }}>{f.after || 'empty'}</RNText>
            </RNText>
          </View>
        ),
      )}
      {proposal.reason ? <RNText style={[c.type.labelUi, { color: c.colors.muted }]}>{proposal.reason}</RNText> : null}
      {stale && <RNText style={[c.type.labelUi, { color: c.colors.warn }]}>Edited since this was proposed; the change shows today’s text.</RNText>}
      <View style={styles.actions}>
        <Button
          compact
          variant="primary"
          label="Approve"
          loading={busy === 'apply'}
          disabled={busy !== null || !canApply}
          onPress={() => onDecide('apply')}
        />
        <Button compact variant="ghost" label="Reject" loading={busy === 'reject'} disabled={busy !== null} onPress={() => onDecide('reject')} />
      </View>
      <View style={styles.strip}>
        <LabelStrip label={first ? { name: first.name, color: first.color, extra: spaces.length - 1 } : { name: null, color: null }} meta={proposal.item_type} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: 28, paddingTop: 20, paddingHorizontal: 20, gap: 14, overflow: 'hidden' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  agent: { height: 32, borderRadius: 16, paddingHorizontal: 12, justifyContent: 'center', maxWidth: '100%' },
  what: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  diff: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  diffLine: { fontSize: 17, lineHeight: 26 },
  more: { paddingTop: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 6 },
  strip: { marginHorizontal: -20, marginTop: 6 },
});
