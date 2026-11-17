import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import { ChevronLeft, MoreHorizontal } from 'lucide-react-native';
import type { JournalSpace } from '@memex/core';
import { MarkdownView } from '../notes/MarkdownView';
import { MoldedButton, CardsRoundButton } from './Molded';
import { useCards } from './useCards';

/*
 * A note (m04 right): the space's label strip runs across the top with the
 * note's state (Saved, Saving…, Editing) and •••; under it Back and Edit,
 * then the note on the page: the title big, when it was written, and the
 * markdown on the look's type scale. Editing is the stored markdown as
 * plain text, with Cancel and Save where Edit was.
 */

export interface NoteDraft {
  title: string;
  body: string;
}

export const NotePage = ({
  spaces,
  title,
  meta,
  body,
  draft,
  saving,
  dirty,
  top,
  bottom,
  onBack,
  onEdit,
  onCancel,
  onSave,
  onMore,
  onChange,
}: {
  /** The spaces it's filed in (the strip names the first). */
  spaces: JournalSpace[];
  title: string;
  /** “Written Nov 1, 9:12 · edited …”. */
  meta: string;
  body: string | null;
  /** Non-null while editing. */
  draft: NoteDraft | null;
  saving: boolean;
  dirty: boolean;
  top: number;
  bottom: number;
  onBack: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onMore: () => void;
  onChange: (draft: NoteDraft) => void;
}) => {
  const c = useCards();
  const first = spaces[0];
  const strip = first?.color ?? c.colors.line;
  const stripInk = first ? c.colors.onColor : c.colors.muted;
  const status = saving ? 'Saving…' : draft ? (dirty ? 'Not saved yet' : 'Editing') : 'Saved';
  return (
    <View style={styles.fill}>
      <View style={[styles.band, { paddingTop: top, backgroundColor: strip, boxShadow: 'inset 0 -2px 0 0 #00000014' }]}>
        <View style={styles.bandRow}>
          <RNText style={[c.type.label, styles.bandName, { fontSize: 18, color: stripInk }]} numberOfLines={1}>
            {first ? first.name : 'Unfiled'}
            {spaces.length > 1 ? ` +${spaces.length - 1}` : ''}
          </RNText>
          <RNText style={[c.type.labelUi, { color: stripInk, opacity: 0.72 }]} accessibilityLiveRegion="polite">
            {status}
          </RNText>
          {!draft && (
            <CardsRoundButton label="More" onPress={onMore}>
              <MoreHorizontal size={22} color={c.colors.ink} strokeWidth={2.75} />
            </CardsRoundButton>
          )}
        </View>
      </View>
      <View style={styles.bar}>
        <CardsRoundButton label="Back" onPress={onBack}>
          <ChevronLeft size={24} color={c.colors.ink} strokeWidth={2.75} />
        </CardsRoundButton>
        {draft ? (
          <View style={styles.editActions}>
            <MoldedButton label="Cancel" variant="quiet" onPress={onCancel} />
            <MoldedButton label={saving ? 'Saving…' : 'Save'} variant="primary" onPress={onSave} disabled={saving} />
          </View>
        ) : (
          <MoldedButton label="Edit" onPress={onEdit} />
        )}
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: bottom + 40 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {draft ? (
            <>
              <TextInput
                value={draft.title}
                onChangeText={(value) => onChange({ ...draft, title: value })}
                placeholder="Untitled note"
                placeholderTextColor={c.colors.faint}
                selectionColor={c.colors.primary}
                accessibilityLabel="Note title"
                returnKeyType="next"
                style={[c.type.h1, styles.titleInput, { color: c.colors.ink }]}
              />
              <TextInput
                value={draft.body}
                onChangeText={(value) => onChange({ ...draft, body: value })}
                multiline
                scrollEnabled={false}
                autoFocus
                placeholder="Write in markdown: # heading, - list, **bold**…"
                placeholderTextColor={c.colors.faint}
                selectionColor={c.colors.primary}
                accessibilityLabel="Note text"
                accessibilityHint="Markdown: # for headings, - for lists, **bold**"
                style={[c.type.body, styles.bodyInput, { color: c.colors.ink, backgroundColor: c.colors.well }]}
              />
              <RNText style={[c.type.labelUi, { color: c.colors.muted }]}>Plain markdown, as it’s stored. It reads formatted when you save.</RNText>
            </>
          ) : (
            <>
              <View style={styles.head}>
                <RNText style={[c.type.h1, { color: c.colors.ink }]} selectable accessibilityRole="header">
                  {title}
                </RNText>
                <RNText style={[c.type.labelUi, { color: c.colors.muted, fontFamily: 'Inter_600SemiBold' }]}>{meta}</RNText>
              </View>
              {body?.trim() ? (
                <MarkdownView source={body} />
              ) : (
                <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel="Add text to this note">
                  <RNText style={[c.type.body, { color: c.colors.faint }]}>No text yet. Tap to write.</RNText>
                </Pressable>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  band: { paddingHorizontal: 20, paddingRight: 12 },
  bandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60 },
  bandName: { flex: 1, minWidth: 0 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8 },
  editActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 16 },
  head: { gap: 6 },
  titleInput: { paddingVertical: 4 },
  bodyInput: { minHeight: 280, borderRadius: 24, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 16, textAlignVertical: 'top' },
});
