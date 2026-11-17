import { useState } from 'react';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { Image } from 'expo-image';
import { Check } from 'lucide-react-native';
import { getHostname, sourceOf, type FileableEntry, type Suggestion } from '@memex/core';
import { LabelStrip } from '../cards/MemoryCard';
import { useCards } from '../cards/useCards';
import { entryTitle } from '../journal/useEntryActions';
import { Button } from '../ui/Pressable';

/*
 * A filing suggestion in the Inbox (decision 13; s10, m03): a recent unfiled
 * item with its picture and title, the filer's reason, one filled “File in
 * …” pill in the space's colour and Not now, on an Unfiled label strip. File
 * puts it there; Not now leaves it unfiled (a finished state) and stops
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
