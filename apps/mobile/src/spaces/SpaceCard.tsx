import { Pressable, StyleSheet, View } from 'react-native';
import { CheckSquare, ChevronRight, FileText, Link2, MessageSquareText, Square } from 'lucide-react-native';
import type { Entry } from '@memex/core';
import type { SpaceSummary } from '../data/journal';
import { entryTitle } from '../journal/useEntryActions';
import { alpha, mix } from '../theme/palette';
import { useTheme } from '../theme/theme';
import { Paper } from '../ui/Paper';
import { Text } from '../ui/Text';

/*
 * A space on the Spaces tab: paper in the space's own hue (the dot swells
 * into a glossy swatch, the card's edge takes a faint tint), its counts, and
 * the newest few things in it. Tapping opens the space's board. Paper tints
 * when pressed and never moves.
 */

const countFmt = new Intl.NumberFormat();
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/** “today 11:20”, “yesterday”, “Oct 28”. */
export const lastLabel = (iso: string, now = new Date()) => {
  const at = new Date(iso);
  const days = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime()) /
      86_400_000,
  );
  if (days === 0) return `today ${timeFmt.format(at)}`;
  if (days === 1) return 'yesterday';
  return dateFmt.format(at);
};

const KIND_WORD = { jot: 'Jot', link: 'Link', note: 'Note', task: 'Task' } as const;

const Glyph = ({ entry, color }: { entry: Entry; color: string }) => {
  const props = { size: 14, color, strokeWidth: 1.9 };
  switch (entry.kind) {
    case 'jot':
      return <MessageSquareText {...props} />;
    case 'link':
      return <Link2 {...props} />;
    case 'note':
      return <FileText {...props} />;
    case 'task':
      return entry.task.is_done ? <CheckSquare {...props} /> : <Square {...props} />;
  }
};

export const SpaceCard = ({ summary, onPress, now }: { summary: SpaceSummary; onPress: () => void; now?: Date }) => {
  const t = useTheme();
  const { palette } = t;
  const { space, count, openTasks, recent, lastAt } = summary;
  const meta = [
    `${countFmt.format(count)} ${count === 1 ? 'item' : 'items'}`,
    openTasks ? `${countFmt.format(openTasks)} open ${openTasks === 1 ? 'task' : 'tasks'}` : null,
    lastAt ? `last ${lastLabel(lastAt, now)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${space.name}, ${meta}`}
      onPress={onPress}
      testID={`space-card-${space.id}`}
    >
      {({ pressed }) => (
        <Paper
          level="s"
          radius={t.radius.l}
          style={[
            styles.card,
            { backgroundColor: pressed ? mix(space.color, palette.paper, palette.dark ? 0.12 : 0.07) : palette.paper },
            { boxShadow: `${t.paperShadow('s')}, inset 3px 0 0 0 ${alpha(space.color, 0.85)}` },
          ]}
        >
          <View style={styles.head}>
            <View style={[styles.swatch, { backgroundColor: space.color, boxShadow: `${t.objectShadow}, 0 2px 8px -3px ${alpha(space.color, 0.7)}` }]} />
            <View style={styles.headText}>
              <Text size="m" weight="heavy" numberOfLines={1}>
                {space.name}
              </Text>
              <Text size="xs" tone="muted" numeric numberOfLines={1}>
                {meta}
              </Text>
            </View>
            <ChevronRight size={18} color={palette.faint} strokeWidth={2} />
          </View>
          {recent.length > 0 ? (
            <View style={[styles.recent, { borderTopColor: palette.hairline }]}>
              {recent.map((entry) => (
                <View key={entry.id} style={styles.line} accessible accessibilityLabel={`${KIND_WORD[entry.kind]}: ${entryTitle(entry)}`}>
                  <Glyph entry={entry} color={palette.muted} />
                  <Text size="s" tone="soft" numberOfLines={1} style={styles.lineText}>
                    {entryTitle(entry)}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text size="xs" tone="faint" style={styles.empty}>
              Nothing here yet. Jot in it, or type @{space.name} anywhere.
            </Text>
          )}
        </Paper>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  swatch: { width: 26, height: 26, borderRadius: 8 },
  headText: { flex: 1, minWidth: 0, gap: 1 },
  recent: { gap: 6, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineText: { flex: 1, minWidth: 0 },
  empty: { paddingLeft: 38 },
});
