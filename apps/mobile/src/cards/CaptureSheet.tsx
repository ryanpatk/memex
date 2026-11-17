import { useMemo, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import type { JournalSpace } from '@memex/core';
import type { Composed } from '../data/actions';
import { captureResult, captureStore, type CaptureKind } from './capture';
import { useJournal } from '../data/useJournal';
import { useEntryActions } from '../journal/useEntryActions';
import { Segmented } from '../ui/Segmented';
import { MoldedButton } from './Molded';
import { SpaceToggle } from './Pills';
import { Sheet } from './Sheet';
import { useCards } from './useCards';

/*
 * Save something (m05, the tab bar's +): Jot · Note · Task, a big text well,
 * the spaces as pills (a jot lives in one space, so its pills choose one;
 * notes and tasks can go in several), and Save. The text follows the
 * composer's rules too: a lone link saves the link, `[] ` makes a task, and
 * `@Space` files it. Cards' “Save “…” as a jot” opens it with the search.
 */

/** The sheet, mounted once over the tabs. */
export const CaptureHost = () => {
  const state = useSyncExternalStore(captureStore.subscribe, captureStore.get, captureStore.get);
  const { journal } = useJournal();
  const actions = useEntryActions();
  return (
    <CaptureSheet
      key={state?.key ?? 0}
      open={Boolean(state)}
      initialText={state?.text ?? ''}
      initialKind={state?.kind ?? 'jot'}
      spaces={journal?.spaces ?? []}
      onClose={captureStore.close}
      onSave={async (result) => {
        await actions.compose(result);
        captureStore.close();
      }}
    />
  );
};

export const CaptureSheet = ({
  open,
  initialText,
  initialKind,
  spaces,
  onClose,
  onSave,
}: {
  open: boolean;
  initialText: string;
  initialKind: CaptureKind;
  spaces: JournalSpace[];
  onClose: () => void;
  /** Resolves when saved or kept on the phone; rejects if nothing was kept. */
  onSave: (result: Composed) => Promise<unknown>;
}) => {
  const c = useCards();
  const [text, setText] = useState(initialText);
  const [kind, setKind] = useState<CaptureKind>(initialKind);
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const result = useMemo(() => captureResult(text, kind, spaces, picked), [kind, picked, spaces, text]);
  const oneSpace = kind === 'jot';
  // The text can make something else than the toggle says (a lone link, a “[] ” line).
  const hint = result?.kind === 'link' ? 'Saves the link.' : result?.kind === 'task' && kind !== 'task' ? 'Saves a task.' : null;

  const toggle = (id: string) =>
    setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : oneSpace ? [id] : [...current, id]));

  const save = async () => {
    if (!result || saving) return;
    setSaving(true);
    try {
      await onSave(result);
    } catch {
      setSaving(false); // the toast said why; the text stays
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Save something"
      testID="capture-sheet"
    >
      <Segmented
        label="What to save"
        options={[
          { value: 'jot', label: 'Jot' },
          { value: 'note', label: 'Note' },
          { value: 'task', label: 'Task' },
        ]}
        value={kind}
        onChange={(next) => {
          setKind(next);
          if (next === 'jot') setPicked((current) => current.slice(0, 1));
        }}
      />
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        placeholder={kind === 'note' ? 'Title on the first line…' : kind === 'task' ? 'What needs doing…' : 'A thought, a link…'}
        placeholderTextColor={c.colors.faint}
        selectionColor={c.colors.primary}
        accessibilityLabel={kind === 'note' ? 'Note' : kind === 'task' ? 'Task' : 'Jot'}
        accessibilityHint="Type @ and a space's name to file it there"
        style={[c.type.body, styles.field, { fontSize: 20, lineHeight: 28, color: c.colors.ink, backgroundColor: c.colors.well }]}
      />
      {spaces.length > 0 && (
        <View style={styles.pills} accessibilityLabel={oneSpace ? 'Space (a jot lives in one)' : 'Spaces'}>
          {spaces.map((space) => (
            <View key={space.id} style={styles.pillCell}>
              <SpaceToggle
                name={space.name}
                color={space.color}
                on={picked.includes(space.id) || Boolean(result?.spaces.some((s) => s.id === space.id))}
                onPress={() => toggle(space.id)}
                accessibilityLabel={`File in ${space.name}`}
                grow
              />
            </View>
          ))}
        </View>
      )}
      {hint ? <RNText style={[c.type.labelUi, { color: c.colors.muted }]}>{hint}</RNText> : null}
      <MoldedButton
        variant="primary"
        label={saving ? 'Saving…' : 'Save'}
        accessibilityLabel={result ? `Save ${result.kind}` : 'Save'}
        onPress={() => void save()}
        disabled={!result || saving}
        wide
      />
    </Sheet>
  );
};

const styles = StyleSheet.create({
  field: { minHeight: 112, maxHeight: 220, borderRadius: 24, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, textAlignVertical: 'top' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pillCell: { width: '48%', flexGrow: 1 },
});
