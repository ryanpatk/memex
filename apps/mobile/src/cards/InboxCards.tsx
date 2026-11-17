import { useState } from 'react';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { Image } from 'expo-image';
import { Check } from 'lucide-react-native';
import { compactDiff, type DiffLine } from '@memex/core/agent';
import { getHostname, relativeTime, sourceOf, type FileableEntry, type Suggestion } from '@memex/core';
import type { ProposalView } from '../data/inbox';
import { entryTitle } from '../journal/useEntryActions';
import { Button } from '../ui/Pressable';
import { SpaceChip } from '../ui/SpaceChip';
import { LabelStrip } from './MemoryCard';
import { useCards } from './useCards';

/*
 * Inbox cards (s10, m03). An agent's proposal: the agent's badge and what it
 * wants, the item's title, the change (inserted text green, removed red and
 * struck), its reason, Approve and Reject, and the item's label strip. A
 * filing suggestion: the item's picture and title with the filer's reason,
 * one filled “File in …” pill and Not now, on an Unfiled strip.
 */

const DIFF_LINES = 12;
const VERB = { file: 'wants to file', append: 'wants to add', edit: 'wants to edit' } as const;
const KIND = { link: 'Link', note: 'Note', task: 'Task' } as const;

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

export const CardsProposalCard = ({
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

export const CardsSuggestionCard = ({
  entry,
  suggestion,
  onFile,
  onDismiss,
  onOpen,
}: {
  entry: FileableEntry;
  suggestion: Suggestion;
  onFile: () => void;
  onDismiss: () => void;
  onOpen?: () => void;
}) => {
  const c = useCards();
  const [failed, setFailed] = useState(false);
  const { space, reason } = suggestion;
  const title = entryTitle(entry);
  const link = entry.kind === 'link' ? entry.link : null;
  const host = link ? getHostname(link.url).replace(/^www\./, '') : null;
  const source = link ? sourceOf(link) : null;
  const meta = link ? (source?.key === 'web' ? host : source?.key === 'pinterest' ? 'pinterest' : source?.label) : entry.kind;
  const picture = link?.preview_image_url && !failed ? link.preview_image_url : null;
  return (
    <View style={[styles.card, styles.suggestion, { backgroundColor: c.colors.paper, boxShadow: c.cardShadow }]} testID={`suggestion-${entry.id}`}>
      <Pressable
        onPress={onOpen}
        disabled={!onOpen}
        accessibilityRole={onOpen ? 'link' : undefined}
        accessibilityLabel={`${KIND[entry.kind]}: ${title}`}
        style={styles.item}
      >
        <View style={[styles.thumb, { backgroundColor: c.colors.well }]}>
          {picture ? (
            <Image source={picture} style={StyleSheet.absoluteFill} contentFit="cover" onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
          ) : (
            <RNText style={[c.type.h3, { color: c.colors.muted }]}>{(host ?? KIND[entry.kind]).slice(0, 1).toUpperCase()}</RNText>
          )}
        </View>
        <View style={styles.itemText}>
          <RNText style={[c.type.h3, { fontSize: 21, lineHeight: 26, color: c.colors.ink }]} numberOfLines={3}>
            {title}
          </RNText>
          <RNText style={[c.type.labelUi, { color: c.colors.muted }]} numberOfLines={2} accessibilityLabel={`Likely ${space.name}: ${reason}`}>
            {reason}
          </RNText>
        </View>
      </Pressable>
      <View style={styles.actions}>
        <Pressable onPress={onFile} accessibilityRole="button" accessibilityLabel={`File in ${space.name}`} style={styles.fileCell}>
          {({ pressed }) => (
            <View style={[styles.file, { backgroundColor: space.color, boxShadow: c.molded(pressed), transform: pressed ? [{ scale: 0.96 }] : undefined }]}>
              <View style={[styles.fileDisc, { backgroundColor: c.colors.paper }]}>
                <Check size={18} color={c.colors.ink} strokeWidth={3.25} />
              </View>
              <RNText style={[c.type.label, styles.fileLabel, { color: c.colors.onColor }]} numberOfLines={1}>
                File in {space.name}
              </RNText>
            </View>
          )}
        </Pressable>
        <Button compact variant="ghost" label="Not now" onPress={onDismiss} />
      </View>
      <View style={[styles.strip, styles.suggestionStrip]}>
        <LabelStrip label={{ name: null, color: null }} meta={meta ?? undefined} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: 28, paddingTop: 20, paddingHorizontal: 20, gap: 14, overflow: 'hidden' },
  suggestion: { paddingTop: 16, paddingHorizontal: 16 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  agent: { height: 32, borderRadius: 16, paddingHorizontal: 12, justifyContent: 'center', maxWidth: '100%' },
  what: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  diff: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  diffLine: { fontSize: 17, lineHeight: 26 },
  more: { paddingTop: 8 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 6 },
  strip: { marginHorizontal: -20, marginTop: 6 },
  suggestionStrip: { marginHorizontal: -16 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  thumb: { width: 88, height: 72, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, minWidth: 0, gap: 4 },
  fileCell: { flexShrink: 1 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, borderRadius: 24, paddingLeft: 8, paddingRight: 18 },
  fileDisc: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  fileLabel: { flexShrink: 1 },
});
