import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Bot, Check, X } from 'lucide-react-native';
import { compactDiff, type DiffLine } from '@memex/core/agent';
import { relativeTime } from '@memex/core';
import type { ProposalView } from '../data/inbox';
import { alpha, mix } from '../theme/palette';
import { FONTS, useTheme } from '../theme/theme';
import { Paper } from '../ui/Paper';
import { Button } from '../ui/Pressable';
import { SpaceChip } from '../ui/SpaceChip';
import { Text } from '../ui/Text';

/*
 * One agent proposal (web: ProposalRow): which agent, what it wants to do,
 * the item, its reason, and the change itself (core's proposalFields: a
 * line diff for text, before → after for the rest). Nothing changes until
 * Approve; Reject keeps the record. Paper to read, two objects to decide.
 */

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });
const DIFF_LINES = 12;

const Diff = ({ lines }: { lines: DiffLine[] }) => {
  const t = useTheme();
  const { palette } = t;
  const [all, setAll] = useState(false);
  const compact = compactDiff(lines);
  const shown = all ? compact : compact.slice(0, DIFF_LINES);
  return (
    <View style={[styles.diff, { backgroundColor: palette.well, borderRadius: t.radius.m }]} accessibilityLabel="Changes to the text">
      {shown.map((line, i) =>
        line.op === 'skip' ? (
          <Text key={i} size="xxs" tone="faint" style={styles.diffLine}>
            {`⋯ ${line.count} unchanged ${line.count === 1 ? 'line' : 'lines'}`}
          </Text>
        ) : (
          <Text
            key={i}
            accessibilityLabel={`${line.op === 'add' ? 'Added: ' : line.op === 'del' ? 'Removed: ' : ''}${line.text}`}
            style={[
              styles.diffLine,
              { fontFamily: MONO, fontSize: 12, lineHeight: 18, color: palette.inkSoft },
              line.op === 'add' && { backgroundColor: mix(palette.success, palette.well, 0.16), color: palette.ink },
              line.op === 'del' && { backgroundColor: mix(palette.error, palette.well, 0.12), color: palette.muted, textDecorationLine: 'line-through' },
            ]}
          >
            {line.op === 'add' ? '+ ' : line.op === 'del' ? '− ' : '  '}
            {line.text || ' '}
          </Text>
        ),
      )}
      {compact.length > DIFF_LINES && (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: all }} onPress={() => setAll((v) => !v)} hitSlop={8}>
          <Text size="xs" weight="heavy" tone="accent" style={styles.more}>
            {all ? 'Show less' : `Show all ${compact.length} lines`}
          </Text>
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
  const t = useTheme();
  const { palette } = t;
  const { proposal, title, space, fields, stale, what, canApply } = view;
  return (
    <Paper level="s" radius={t.radius.l} style={styles.card} testID={`proposal-${proposal.id}`}>
      <View style={styles.who}>
        <View style={[styles.bot, { backgroundColor: palette.tint }]}>
          <Bot size={14} color={palette.tintInk} strokeWidth={2} />
        </View>
        <Text size="xs" weight="heavy" tone="soft" numberOfLines={1} style={styles.flex}>
          {proposal.client_name}
        </Text>
        <Text size="xxs" tone="faint" numeric>
          {relativeTime(proposal.created_at, now)}
        </Text>
      </View>
      <View style={styles.what}>
        <Text size="xs" tone="muted">
          {what}
          {proposal.kind === 'file' && !space ? ' a space that no longer exists' : ''}
        </Text>
        {proposal.kind === 'file' && space && <SpaceChip space={space} />}
      </View>
      {title !== null ? (
        <Text size="m" weight="medium" numberOfLines={3}>
          {title}
        </Text>
      ) : (
        <Text size="s" tone="muted">
          This item no longer exists.
        </Text>
      )}
      {proposal.reason ? (
        <Text size="s" tone="soft" style={styles.reason}>
          “{proposal.reason}”
        </Text>
      ) : null}
      {stale && (
        <Text size="xs" style={{ color: palette.warning }}>
          Edited since this was proposed; the diff shows today’s text.
        </Text>
      )}
      {fields.map((f) =>
        f.field === 'text' ? (
          <View key={f.field} style={styles.field}>
            <Text size="xxs" weight="heavy" tone="muted">
              {f.label}
            </Text>
            <Diff lines={f.lines} />
          </View>
        ) : (
          <View key={f.field} style={styles.field} accessible accessibilityLabel={`${f.label}: ${f.before || 'empty'} becomes ${f.after || 'empty'}`}>
            <Text size="xxs" weight="heavy" tone="muted">
              {f.label}
            </Text>
            <Text size="s">
              <Text size="s" tone="muted" style={styles.struck}>
                {f.before || 'empty'}
              </Text>
              <Text size="s" tone="faint">
                {'  →  '}
              </Text>
              <Text size="s" weight="medium" style={{ backgroundColor: alpha(palette.success, 0.14) }}>
                {f.after || 'empty'}
              </Text>
            </Text>
          </View>
        ),
      )}
      <View style={styles.actions}>
        <Button
          compact
          variant="primary"
          label="Approve"
          icon={<Check size={16} color={palette.onAccent} strokeWidth={2.5} />}
          loading={busy === 'apply'}
          disabled={busy !== null || !canApply}
          onPress={() => onDecide('apply')}
          style={styles.flex}
        />
        <Button
          compact
          label="Reject"
          icon={<X size={16} color={palette.ink} strokeWidth={2.25} />}
          loading={busy === 'reject'}
          disabled={busy !== null}
          onPress={() => onDecide('reject')}
          style={styles.flex}
        />
      </View>
    </Paper>
  );
};

const styles = StyleSheet.create({
  card: { padding: 14, gap: 8 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bot: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  what: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  reason: { fontFamily: FONTS.italic },
  field: { gap: 4 },
  diff: { paddingVertical: 6, overflow: 'hidden' },
  diffLine: { paddingHorizontal: 10 },
  more: { paddingHorizontal: 10, paddingTop: 6 },
  struck: { textDecorationLine: 'line-through' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
