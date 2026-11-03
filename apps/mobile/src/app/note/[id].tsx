import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { FileX, MoreHorizontal, PencilLine } from 'lucide-react-native';
import { noteDisplayTitle, type Entry } from '@memex/core';
import { useActions } from '../../data/DataProvider';
import { useJournal } from '../../data/useJournal';
import { entryMenuItems, showMenu } from '../../journal/entryMenu';
import { entryLabel, useEntryActions } from '../../journal/useEntryActions';
import { MarkdownView } from '../../notes/MarkdownView';
import { alpha } from '../../theme/palette';
import { typeRole, useTheme } from '../../theme/theme';
import { Canvas } from '../../ui/Canvas';
import { FeedError } from '../../ui/FeedStates';
import { Paper } from '../../ui/Paper';
import { Placeholder } from '../../ui/Placeholder';
import { Button } from '../../ui/Pressable';
import { RoundButton } from '../../ui/RoundButton';
import { SpaceChip } from '../../ui/SpaceChip';
import { StackHeader } from '../../ui/StackHeader';
import { Text } from '../../ui/Text';
import { useToast } from '../../ui/Toast';

/*
 * A note (ROADMAP Phase 6: note view). Reading: its title, when it was
 * written, its spaces and its markdown rendered on paper. Editing is plain
 * text, the stored markdown itself, saved through the Repository
 * (notes.update) with the same optimistic write as everything else; the
 * rich editor (a DOM component around the web's MarkdownEditor) comes later.
 * If the note changed elsewhere while you edited, Save asks before
 * overwriting. Leaving with unsaved changes asks first.
 */

type NoteEntry = Extract<Entry, { kind: 'note' }>;

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { journal, isLoading, unavailable, error, refreshing, refresh } = useJournal();
  const entry = journal?.entries.find((e): e is NoteEntry => e.kind === 'note' && e.note.id === id);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (entry && journal) return <Note entry={entry} spaces={journal.spaces} onBack={back} />;
  // “Gone” only after a load that worked and didn't find it.
  return (
    <Canvas>
      <StackHeader />
      {isLoading ? null : unavailable ? (
        <FeedError error={error} onRetry={refresh} title="Couldn’t load this note" retrying={refreshing} />
      ) : (
        <Gone onBack={back} />
      )}
    </Canvas>
  );
}

interface Draft {
  title: string;
  body: string;
  /** The note's `updated_at` when editing began. */
  base: string;
}

const Note = ({ entry, spaces, onBack }: { entry: NoteEntry; spaces: NonNullable<ReturnType<typeof useJournal>['journal']>['spaces']; onBack: () => void }) => {
  const t = useTheme();
  const { palette } = t;
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const actions = useActions();
  const entryActions = useEntryActions();
  const { note } = entry;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const editing = draft !== null;
  const dirty = Boolean(draft && (draft.title !== (note.title ?? '') || draft.body !== (note.body ?? '')));
  const title = noteDisplayTitle(note);
  const edited = note.updated_at && note.updated_at.slice(0, 16) !== note.created_at.slice(0, 16);

  useFocusEffect(
    useCallback(() => {
      toast.setInset(insets.bottom + 16);
      return () => toast.setInset(96);
    }, [insets.bottom, toast]),
  );

  const startEditing = () => {
    void Haptics.selectionAsync();
    setDraft({ title: note.title ?? '', body: note.body ?? '', base: note.updated_at });
  };

  /** Run `then` now, or after confirming that unsaved changes can go. */
  const leave = (then: () => void) => {
    if (!dirty) return then();
    Alert.alert('Discard your changes?', 'Your edits to this note haven’t been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: then },
    ]);
  };

  const write = async (next: Draft) => {
    setSaving(true);
    try {
      await actions.updateNote(note, next);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show('Note saved.');
      setDraft(null);
    } catch (error) {
      console.warn('Note save failed:', error);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('Couldn’t save the note. Your text is still here.', { tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    if (!draft) return;
    if (!dirty) return setDraft(null);
    if (note.updated_at !== draft.base) {
      Alert.alert('This note changed', 'It was edited somewhere else while you were editing here. Save yours over it?', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Save mine', style: 'destructive', onPress: () => void write(draft) },
      ]);
      return;
    }
    void write(draft);
  };

  const menu = entryMenuItems(entry, spaces, entryActions)
    .filter((i) => i.name !== 'open')
    .map((i) => (i.name === 'delete' ? { ...i, run: () => (entryActions.deleteEntry(entry), onBack()) } : i));

  return (
    <Canvas>
      <Stack.Screen options={{ gestureEnabled: !editing }} />
      <StackHeader
        onBack={() => leave(onBack)}
        trailing={
          editing ? (
            <>
              <Button label="Cancel" variant="ghost" onPress={() => leave(() => setDraft(null))} compact />
              <Button label="Save" variant="primary" loading={saving} onPress={save} compact />
            </>
          ) : (
            <>
              <Button
                label="Edit"
                icon={<PencilLine size={16} color={palette.ink} strokeWidth={2} />}
                onPress={startEditing}
                compact
              />
              <RoundButton label="More" onPress={() => showMenu(entryLabel(entry), menu)} icon={(color) => <MoreHorizontal size={20} color={color} strokeWidth={2} />} />
            </>
          )
        }
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 33 }]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          {editing && draft ? (
            <View style={styles.editor}>
              <TextInput
                value={draft.title}
                onChangeText={(value) => setDraft({ ...draft, title: value })}
                placeholder="Untitled note"
                placeholderTextColor={palette.faint}
                selectionColor={palette.accent}
                accessibilityLabel="Note title"
                returnKeyType="next"
                style={[typeRole('l', 'heavy'), styles.titleInput, { color: palette.ink }]}
              />
              <TextInput
                value={draft.body}
                onChangeText={(value) => setDraft({ ...draft, body: value })}
                multiline
                scrollEnabled={false}
                autoFocus
                placeholder="Write in markdown: # heading, - list, **bold**…"
                placeholderTextColor={palette.faint}
                selectionColor={palette.accent}
                accessibilityLabel="Note text"
                accessibilityHint="Markdown: # for headings, - for lists, **bold**"
                style={[
                  typeRole('m'),
                  styles.bodyInput,
                  {
                    color: palette.ink,
                    backgroundColor: palette.well,
                    borderRadius: t.radius.l,
                    boxShadow: palette.dark
                      ? `inset 0 1px 2px 0 #13171d33, 0 0 0 2px ${alpha(palette.accent, 0.4)}`
                      : `inset 0 1px 2px 0 #1d212714, 0 0 0 2px ${alpha(palette.accent, 0.35)}`,
                  },
                ]}
              />
              <Text size="xxs" tone="muted" style={styles.hint}>
                Plain markdown, as it’s stored. It reads formatted when you save.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.head}>
                <Text size="l" weight="heavy" selectable accessibilityRole="header">
                  {title}
                </Text>
                <Text size="xs" weight="medium" tone="muted" numeric>
                  Note · {dateFmt.format(new Date(note.created_at))}
                  {edited ? ` · edited ${dateFmt.format(new Date(note.updated_at))}` : ''}
                </Text>
                {entry.spaces.length > 0 && (
                  <View style={styles.spaces}>
                    {entry.spaces.map((s) => (
                      <SpaceChip key={s.id} space={s} />
                    ))}
                  </View>
                )}
              </View>
              <Paper level="m" radius={t.radius.l} style={styles.page}>
                {note.body?.trim() ? (
                  <MarkdownView source={note.body} />
                ) : (
                  <Pressable onPress={startEditing} accessibilityRole="button" accessibilityLabel="Add text to this note">
                    <Text size="m" tone="faint">
                      No text yet. Tap to write.
                    </Text>
                  </Pressable>
                )}
              </Paper>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Canvas>
  );
};

const Gone = ({ onBack }: { onBack: () => void }) => {
  const { palette } = useTheme();
  return (
    <View style={styles.gone}>
      <Placeholder icon={<FileX size={26} color={palette.onAccent} strokeWidth={2} />} title="This note isn’t here anymore" body="It may have been deleted on another device.">
        <Button label="Back" onPress={onBack} />
      </Placeholder>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingHorizontal: 17, paddingTop: 4, gap: 17 },
  head: { gap: 6, paddingHorizontal: 2 },
  spaces: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  page: { paddingHorizontal: 17, paddingVertical: 17 },
  editor: { gap: 10 },
  titleInput: { paddingHorizontal: 2, paddingVertical: 4 },
  bodyInput: { minHeight: 280, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' },
  hint: { paddingHorizontal: 4 },
  gone: { flex: 1, justifyContent: 'center', paddingBottom: 80 },
});
