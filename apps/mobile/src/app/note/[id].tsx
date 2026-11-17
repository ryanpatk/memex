import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { FileX } from 'lucide-react-native';
import { noteDisplayTitle, type Entry } from '@memex/core';
import { useActions } from '../../data/DataProvider';
import { useJournal } from '../../data/useJournal';
import { entryMenuItems, showMenu } from '../../journal/entryMenu';
import { entryLabel, useEntryActions } from '../../journal/useEntryActions';
import { Canvas } from '../../ui/Canvas';
import { FeedError } from '../../ui/FeedStates';
import { Placeholder } from '../../ui/Placeholder';
import { Button } from '../../ui/Pressable';
import { StackHeader } from '../../ui/StackHeader';
import { useToast } from '../../ui/Toast';
import { NotePage } from '../../cards/NotePage';

/*
 * A note (ROADMAP Phase 6: note view; m04, cards/NotePage). Reading: its
 * space's label strip, its title, when it was written and its markdown
 * rendered on the look's type scale. Editing is plain
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
      <NotePage
        spaces={entry.spaces}
        title={title}
        meta={`Written ${dateFmt.format(new Date(note.created_at))}${edited ? ` · edited ${dateFmt.format(new Date(note.updated_at))}` : ''}`}
        body={note.body}
        draft={draft}
        saving={saving}
        dirty={dirty}
        top={insets.top}
        bottom={insets.bottom}
        onBack={() => leave(onBack)}
        onEdit={startEditing}
        onCancel={() => leave(() => setDraft(null))}
        onSave={save}
        onMore={() => showMenu(entryLabel(entry), [{ name: 'edit', label: 'Edit', run: startEditing }, ...menu])}
        onChange={(next) => draft && setDraft({ ...draft, ...next })}
      />
    </Canvas>
  );
};

const Gone = ({ onBack }: { onBack: () => void }) => (
  <View style={styles.gone}>
    <Placeholder icon={<FileX />} title="This note isn’t here anymore" body="It may have been deleted on another device.">
      <Button label="Back" onPress={onBack} />
    </Placeholder>
  </View>
);

const styles = StyleSheet.create({
  gone: { flex: 1, justifyContent: 'center', paddingBottom: 80 },
});
