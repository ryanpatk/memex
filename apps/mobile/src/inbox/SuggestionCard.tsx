import { Pressable, StyleSheet, View } from 'react-native';
import { FileText, Link2, Square } from 'lucide-react-native';
import { getHostname, type FileableEntry, type Suggestion } from '@memex/core';
import { entryTitle } from '../journal/useEntryActions';
import { alpha, mix } from '../theme/palette';
import { useTheme } from '../theme/theme';
import { Paper } from '../ui/Paper';
import { Button } from '../ui/Pressable';
import { Text } from '../ui/Text';

/*
 * A filing suggestion in the Inbox (decision 13, web: the tray's InboxRow):
 * a recent unfiled item, the space the filer thinks it belongs in, and why.
 * File puts it there; Not now leaves it unfiled (a finished state) and stops
 * suggesting it on this phone. Both come with Undo.
 */

const KIND = { link: 'Link', note: 'Note', task: 'Task' } as const;

export const SuggestionCard = ({
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
  const t = useTheme();
  const { palette } = t;
  const { space, reason } = suggestion;
  const title = entryTitle(entry);
  const where = entry.kind === 'link' ? getHostname(entry.link.url).replace(/^www\./, '') : KIND[entry.kind];
  const Icon = entry.kind === 'link' ? Link2 : entry.kind === 'note' ? FileText : Square;
  return (
    <Paper level="s" radius={t.radius.l} style={styles.card} testID={`suggestion-${entry.id}`}>
      <Pressable
        onPress={onOpen}
        disabled={!onOpen}
        accessibilityRole={onOpen ? 'link' : undefined}
        accessibilityLabel={`${KIND[entry.kind]}: ${title}`}
        style={styles.item}
      >
        <View style={[styles.icon, { backgroundColor: palette.tint }]}>
          <Icon size={15} color={palette.tintInk} strokeWidth={1.9} />
        </View>
        <View style={styles.text}>
          <Text size="s" weight="medium" numberOfLines={2}>
            {title}
          </Text>
          <Text size="xs" tone="muted" numberOfLines={1}>
            {where}
          </Text>
        </View>
      </Pressable>
      <View
        style={[styles.guess, { borderColor: alpha(space.color, 0.7), backgroundColor: mix(space.color, palette.paper, palette.dark ? 0.1 : 0.05) }]}
        accessible
        accessibilityLabel={`Likely ${space.name}: ${reason}`}
      >
        <View style={[styles.dot, { backgroundColor: space.color }]} />
        <Text size="xs" weight="heavy" tone="soft" numberOfLines={1} style={styles.space}>
          {space.name}?
        </Text>
        <Text size="xs" tone="muted" numberOfLines={2} style={styles.reason}>
          {reason}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button compact variant="primary" label={`File in ${space.name}`} onPress={onFile} style={styles.file} />
        <Button compact variant="ghost" label="Not now" onPress={onDismiss} />
      </View>
    </Paper>
  );
};

const styles = StyleSheet.create({
  card: { padding: 12, gap: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: 1 },
  guess: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  space: { flexShrink: 0, maxWidth: '45%' },
  reason: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  file: { flex: 1 },
});
