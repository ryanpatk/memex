import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text as RNText, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getHostname, type JournalSpace } from '@memex/core';
import { faviconFor } from '../data/actions';
import { insertMention, pickerFor } from '../journal/composerModel';
import type { ShareSheetProps } from '../share/ShareSheet';
import { SAVE_LABEL, shareResult } from '../share/shareModel';
import { Segmented } from '../ui/Segmented';
import { MemoryCard } from './MemoryCard';
import { MoldedButton } from './Molded';
import { SpaceToggle } from './Pills';
import { useCards } from './useCards';

/*
 * Save to memex (m05 right, m06 left): what you shared as the card it will
 * become (its label strip names the space you pick), the spaces as pills,
 * recent first, a note for a link (`@Space` files it too), and Save. Shared
 * text is editable, as a jot or a note. Signed out, the card waits and Sign
 * in brings it along.
 */
export const CardsShareSheet = ({ content, spaces, signedIn, onSave, onClose, onSignIn }: ShareSheetProps) => {
  const c = useCards();
  const isLink = content.kind === 'link';
  const [field, setField] = useState(content.kind === 'link' ? (content.note ?? '') : content.kind === 'text' ? content.text : '');
  const [caret, setCaret] = useState(field.length);
  const [picked, setPicked] = useState<JournalSpace | null>(null);
  const [asNote, setAsNote] = useState(false);
  const [saving, setSaving] = useState(false);
  // Signed in it's a page sheet, already below the status bar; signed out it's a full screen.
  const insets = useSafeAreaInsets();
  const top = signedIn ? 20 : insets.top + 12;

  const result = useMemo(() => shareResult(content, field, spaces, picked, asNote), [asNote, content, field, picked, spaces]);
  const picker = useMemo(() => pickerFor(field, caret, spaces), [caret, field, spaces]);
  const filedKey = result?.spaces.map((s) => s.id).join(',') ?? '';
  const filed = useMemo(() => new Set(filedKey ? filedKey.split(',') : []), [filedKey]);
  // Where it'll be filed leads the row (so a typed @Space is in view), then the rest, recent first.
  const ordered = useMemo(() => [...spaces.filter((s) => filed.has(s.id)), ...spaces.filter((s) => !filed.has(s.id))], [filed, spaces]);
  const first = spaces.find((s) => filed.has(s.id));
  const label = first ? { name: first.name, color: first.color, extra: filed.size - 1 } : { name: null, color: null };

  const save = async () => {
    if (!result || saving) return;
    setSaving(true);
    try {
      await onSave(result);
    } catch {
      setSaving(false); // the toast said why; the sheet stays so nothing is lost
    }
  };

  const host = isLink ? getHostname(content.url).replace(/^www\./, '') : '';
  const favicon = isLink ? faviconFor(content.url) : null;

  return (
    <View style={styles.root} testID="share-sheet">
      <View style={[styles.header, { paddingTop: top }]}>
        <RNText style={[c.type.h2, styles.flex, { color: c.colors.ink }]} accessibilityRole="header">
          Save to memex
        </RNText>
        <MoldedButton label="Cancel" variant="quiet" onPress={onClose} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {content.kind === 'empty' ? (
          <View style={[styles.empty, { backgroundColor: c.colors.paper, boxShadow: c.cardShadow }]}>
            <RNText style={[c.type.h3, { color: c.colors.ink }]}>Nothing to save</RNText>
            <RNText style={[c.type.body, { color: c.colors.muted }]}>memex saves links and text. This share had neither.</RNText>
          </View>
        ) : isLink ? (
          <MemoryCard
            kind="link"
            title={content.title ?? host}
            label={label}
            meta={host}
            favicon={{ uri: favicon, letter: host.slice(0, 1).toUpperCase() }}
            accessibilityLabel={`Link: ${content.title ?? host}, ${content.url}`}
          />
        ) : (
          <View style={styles.section}>
            <TextInput
              value={field}
              onChangeText={setField}
              onSelectionChange={(e) => setCaret(e.nativeEvent.selection.start)}
              multiline
              editable={signedIn && !saving}
              placeholder="Shared text…"
              placeholderTextColor={c.colors.faint}
              selectionColor={c.colors.primary}
              accessibilityLabel="Shared text"
              accessibilityHint="Saves a jot; start with [] for a task, type @ to file in a space"
              style={[c.type.body, styles.text, { fontSize: 20, lineHeight: 28, color: c.colors.ink, backgroundColor: c.colors.well }]}
            />
            {signedIn && (
              <Segmented
                label="Save as"
                options={[
                  { value: 'jot', label: 'Jot' },
                  { value: 'note', label: 'Note' },
                ]}
                value={asNote ? 'note' : 'jot'}
                onChange={(next) => setAsNote(next === 'note')}
              />
            )}
          </View>
        )}

        {!signedIn ? (
          <View style={styles.section} testID="share-signed-out">
            <RNText style={[c.type.body, { color: c.colors.ink }]}>You’re signed out. Sign in and this save comes with you.</RNText>
            <MoldedButton variant="primary" label="Sign in" onPress={onSignIn} wide />
          </View>
        ) : content.kind !== 'empty' ? (
          <>
            <View style={styles.section}>
              {picker ? <RNText style={[c.type.labelUi, { color: c.colors.muted, fontFamily: 'Inter_600SemiBold' }]}>File in…</RNText> : null}
              <ScrollView
                horizontal
                keyboardShouldPersistTaps="always"
                showsHorizontalScrollIndicator={false}
                style={styles.rail}
                contentContainerStyle={styles.pills}
                accessibilityLabel="Spaces"
              >
                {(picker ? picker.matches : ordered).map((space) => (
                  <SpaceToggle
                    key={space.id}
                    name={space.name}
                    color={space.color}
                    on={!picker && filed.has(space.id)}
                    accessibilityLabel={`File in ${space.name}`}
                    onPress={() => {
                      if (picker) {
                        const next = insertMention(field, caret, picker.query, space);
                        setField(next.text);
                        setCaret(next.caret);
                      } else setPicked((current) => (current?.id === space.id ? null : space));
                    }}
                  />
                ))}
              </ScrollView>
            </View>
            {isLink && (
              <View style={styles.section}>
                <RNText style={[c.type.labelUi, { color: c.colors.muted, fontFamily: 'Inter_600SemiBold', fontSize: 17 }]}>Note</RNText>
                <TextInput
                  value={field}
                  onChangeText={setField}
                  onSelectionChange={(e) => setCaret(e.nativeEvent.selection.start)}
                  multiline
                  editable={!saving}
                  placeholder="Why I saved this"
                  placeholderTextColor={c.colors.faint}
                  selectionColor={c.colors.primary}
                  accessibilityLabel="Note"
                  accessibilityHint="Optional. Type @ to file it in a space"
                  style={[c.type.body, styles.note, { color: c.colors.ink, backgroundColor: c.colors.well }]}
                />
              </View>
            )}
          </>
        ) : null}
      </ScrollView>

      {signedIn && content.kind !== 'empty' && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <MoldedButton
            variant="primary"
            label={saving ? 'Saving…' : 'Save'}
            accessibilityLabel={result ? SAVE_LABEL[result.kind] : 'Save'}
            disabled={!result || saving}
            onPress={() => void save()}
            wide
            testID="share-save"
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 24, paddingRight: 12, paddingBottom: 12 },
  body: { paddingHorizontal: 24, paddingBottom: 20, gap: 18 },
  empty: { borderRadius: 28, padding: 20, gap: 8 },
  section: { gap: 12 },
  text: { minHeight: 112, maxHeight: 220, borderRadius: 24, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, textAlignVertical: 'top' },
  // Edge to edge, so the pills scroll past the sheet's margin.
  rail: { marginHorizontal: -24 },
  pills: { gap: 8, paddingHorizontal: 24, paddingVertical: 4, alignItems: 'center' },
  note: { minHeight: 64, maxHeight: 140, borderRadius: 20, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 18, textAlignVertical: 'top' },
  footer: { paddingHorizontal: 24, paddingTop: 8 },
});
