import { ScrollView, StyleSheet, View } from 'react-native';
import { Inbox as InboxIcon } from 'lucide-react-native';
import { entryText, getLinkTitle, noteDisplayTitle, type FileableEntry } from '@memex/core';
import { useJournal } from '../../data/useJournal';
import { alpha, mix } from '../../theme/palette';
import { useTheme } from '../../theme/theme';
import { Canvas } from '../../ui/Canvas';
import { Paper } from '../../ui/Paper';
import { Placeholder } from '../../ui/Placeholder';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { Text } from '../../ui/Text';

const titleOf = (entry: FileableEntry) => {
  switch (entry.kind) {
    case 'link':
      return getLinkTitle(entry.link);
    case 'note':
      return noteDisplayTitle(entry.note);
    default:
      return entryText(entry);
  }
};

const KIND = { link: 'Link', note: 'Note', task: 'Task' } as const;

/** Inbox (decision 13): recent unfiled things with a likely space. Filing from the phone comes next. */
export default function InboxScreen() {
  const t = useTheme();
  const { journal } = useJournal();
  const inbox = journal?.inbox ?? [];

  return (
    <Canvas>
      <ScreenHeader title="Inbox" subtitle={journal ? (inbox.length ? `${inbox.length} waiting` : 'All caught up') : undefined} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {journal && inbox.length === 0 ? (
          <Placeholder
            icon={<InboxIcon size={26} color={t.palette.onAccent} strokeWidth={2} />}
            title="Nothing waiting"
            body="Unfiled is a finished state. When memex has a likely space for something new, it waits here with its reason."
          />
        ) : (
          inbox.map(({ entry, suggestion }) => (
            <Paper key={entry.id} style={styles.card}>
              <Text size="xxs" weight="heavy" tone="faint">
                {KIND[entry.kind]}
              </Text>
              <Text size="s" weight="medium" numberOfLines={2}>
                {titleOf(entry)}
              </Text>
              <View style={styles.suggestion}>
                <View
                  style={[
                    styles.chip,
                    {
                      borderColor: alpha(suggestion.space.color, 0.6),
                      backgroundColor: mix(suggestion.space.color, t.palette.paper, 0.08),
                    },
                  ]}
                >
                  <View style={[styles.dot, { backgroundColor: suggestion.space.color }]} />
                  <Text size="xs" weight="medium" tone="soft" numberOfLines={1}>
                    {suggestion.space.name}
                  </Text>
                </View>
                <Text size="xs" tone="muted" numberOfLines={2} style={styles.reason}>
                  {suggestion.reason}
                </Text>
              </View>
            </Paper>
          ))
        )}
        {inbox.length > 0 && (
          <Text size="xs" tone="faint" style={styles.note}>
            One-press filing from the phone comes next; file on the web for now.
          </Text>
        )}
      </ScrollView>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: 8, paddingBottom: 33, paddingHorizontal: 17, gap: 10 },
  card: { padding: 12, gap: 4 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
    borderWidth: 1,
    borderStyle: 'dashed',
    maxWidth: 160,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  reason: { flex: 1, minWidth: 0 },
  note: { textAlign: 'center', paddingHorizontal: 17, marginTop: 4 },
});
