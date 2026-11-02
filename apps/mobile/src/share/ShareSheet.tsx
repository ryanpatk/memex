import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, FileText, LogIn, X } from 'lucide-react-native';
import { getHostname, type JournalSpace, type SharedContent } from '@memex/core';
import { faviconFor, type Composed } from '../data/actions';
import { insertMention, KIND_HINT, pickerFor } from '../journal/composerModel';
import { alpha, mix } from '../theme/palette';
import { typeRole, useTheme } from '../theme/theme';
import { Paper } from '../ui/Paper';
import { Button, usePressSettle } from '../ui/Pressable';
import { RoundButton } from '../ui/RoundButton';
import { Text } from '../ui/Text';
import { destination, linkSource, SAVE_LABEL, shareResult } from './shareModel';

/*
 * The share sheet: what you shared from Safari, X, YouTube or anywhere, on
 * paper, with an optional space and Save. A link shows its site and title
 * and takes a note ("why I saved it", `@Space` files it); shared text is
 * editable and follows the composer's rules (a jot, `[] ` a task, the page
 * button a note). Spaces you filed in lately come first. Signed out, it
 * says so and keeps the item until you've signed in.
 */

export interface ShareSheetProps {
  content: SharedContent;
  /** Recent first (shareModel.recentSpaces). */
  spaces: JournalSpace[];
  signedIn: boolean;
  /** Resolves when saved or kept on the phone; rejects if nothing was kept. */
  onSave: (result: Composed) => Promise<unknown>;
  onClose: () => void;
  onSignIn: () => void;
}

export const ShareSheet = ({ content, spaces, signedIn, onSave, onClose, onSignIn }: ShareSheetProps) => {
  const t = useTheme();
  const { palette } = t;
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

  const save = async () => {
    if (!result || saving) return;
    setSaving(true);
    try {
      await onSave(result);
    } catch {
      setSaving(false); // the toast said why; the sheet stays so nothing is lost
    }
  };

  return (
    <View style={styles.root} testID="share-sheet">
      <View style={[styles.header, { paddingTop: top }]}>
        <View style={styles.headerText}>
          <Text size="l" weight="heavy" accessibilityRole="header">
            Save to memex
          </Text>
          <Text size="xs" weight="medium" tone="muted" numberOfLines={1}>
            {signedIn ? destination(result) : 'Signed out'}
          </Text>
        </View>
        <RoundButton label="Close" onPress={onClose} icon={(color) => <X size={20} color={color} strokeWidth={2.25} />} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {content.kind === 'empty' ? (
          <Paper style={styles.card}>
            <Text size="m" weight="medium">
              Nothing to save
            </Text>
            <Text size="s" tone="muted">
              memex saves links and text. This share had neither.
            </Text>
          </Paper>
        ) : isLink ? (
          <LinkPreview url={content.url} title={content.title} />
        ) : (
          <Paper style={styles.card}>
            <TextInput
              value={field}
              onChangeText={setField}
              onSelectionChange={(e) => setCaret(e.nativeEvent.selection.start)}
              multiline
              editable={signedIn && !saving}
              placeholder="Shared text…"
              placeholderTextColor={palette.faint}
              selectionColor={palette.accent}
              accessibilityLabel="Shared text"
              accessibilityHint="Saves a jot; start with [] for a task, type @ to file in a space"
              style={[typeRole('m'), styles.textField, { color: palette.ink }]}
            />
            <View style={styles.kindRow}>
              <Text size="xxs" weight="heavy" tone="accent">
                {result ? KIND_HINT[result.kind] : 'Empty'}
              </Text>
              <Text size="xxs" tone="muted" style={styles.flex} numberOfLines={1}>
                {asNote ? 'First line is the title' : '“[] ” makes a task · @ files it'}
              </Text>
              <NoteToggle on={asNote} onPress={() => setAsNote((v) => !v)} />
            </View>
          </Paper>
        )}

        {!signedIn ? (
          <Paper style={[styles.card, styles.signedOut]} testID="share-signed-out">
            <Text size="m" weight="heavy">
              You’re signed out of memex
            </Text>
            <Text size="s" tone="soft">
              Sign in to save this. It’ll wait here until you do.
            </Text>
            <Button variant="primary" label="Sign in" icon={<LogIn size={18} color={palette.onAccent} strokeWidth={2.25} />} onPress={onSignIn} />
          </Paper>
        ) : content.kind !== 'empty' ? (
          <>
            {isLink && (
              <View style={styles.section}>
                <Text size="xs" weight="heavy" tone="soft">
                  Note
                </Text>
                <TextInput
                  value={field}
                  onChangeText={setField}
                  onSelectionChange={(e) => setCaret(e.nativeEvent.selection.start)}
                  multiline
                  editable={!saving}
                  placeholder="Why you saved it… (@ files it)"
                  placeholderTextColor={palette.faint}
                  selectionColor={palette.accent}
                  accessibilityLabel="Note"
                  accessibilityHint="Optional. Type @ to file it in a space"
                  style={[
                    typeRole('m'),
                    styles.note,
                    {
                      color: palette.ink,
                      backgroundColor: palette.well,
                      borderRadius: t.radius.m,
                      boxShadow: palette.dark
                        ? 'inset 0 1px 2px 0 #13171d33, inset 0 -1px 0 0 #f9fafb1f'
                        : 'inset 0 1px 2px 0 #1d212714, inset 0 -1px 0 0 #ffffff59',
                    },
                  ]}
                />
              </View>
            )}

            <View style={styles.section}>
              <Text size="xs" weight="heavy" tone="soft">
                {picker ? 'File in…' : 'Space'}
              </Text>
              <ScrollView
                horizontal
                keyboardShouldPersistTaps="always"
                showsHorizontalScrollIndicator={false}
                style={styles.chipRail}
                contentContainerStyle={styles.chips}
                accessibilityLabel="Spaces"
              >
                {picker ? (
                  picker.matches.map((space) => (
                    <SpaceToggle
                      key={space.id}
                      space={space}
                      on={false}
                      a11y={`File in ${space.name}`}
                      onPress={() => {
                        const next = insertMention(field, caret, picker.query, space);
                        setField(next.text);
                        setCaret(next.caret);
                      }}
                    />
                  ))
                ) : (
                  <>
                    <SpaceToggle on={!result?.spaces.length} label="Journal" a11y="Journal only" onPress={() => setPicked(null)} />
                    {ordered.map((space) => (
                      <SpaceToggle
                        key={space.id}
                        space={space}
                        on={filed.has(space.id)}
                        a11y={`File in ${space.name}`}
                        onPress={() => setPicked((current) => (current?.id === space.id ? null : space))}
                      />
                    ))}
                  </>
                )}
              </ScrollView>
            </View>
          </>
        ) : null}
      </ScrollView>

      {signedIn && content.kind !== 'empty' && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Button
            variant="primary"
            label={result ? SAVE_LABEL[result.kind] : 'Save'}
            loading={saving}
            disabled={!result}
            onPress={() => void save()}
            testID="share-save"
          />
        </View>
      )}
    </View>
  );
};

const LinkPreview = ({ url, title }: { url: string; title: string | null }) => {
  const t = useTheme();
  const { palette } = t;
  const host = getHostname(url).replace(/^www\./, '');
  const source = linkSource(url);
  const favicon = faviconFor(url);
  return (
    <Paper style={[styles.card, styles.link]} accessible accessibilityLabel={`Link: ${title ?? host}, ${url}`}>
      <View style={[styles.favicon, { backgroundColor: palette.well, borderRadius: t.radius.s }]}>
        {/* Initials until (or unless) the site's icon loads over them. */}
        <Text size="xs" weight="heavy" tone="muted">
          {host.slice(0, 2).toUpperCase()}
        </Text>
        {favicon && (
          <Image source={{ uri: favicon }} style={styles.faviconImage} contentFit="contain" accessibilityIgnoresInvertColors />
        )}
      </View>
      <View style={styles.flex}>
        <Text size="xxs" weight="heavy" tone="muted" numberOfLines={1}>
          {source ? `${source} · ${host}` : host}
        </Text>
        <Text size="m" weight="medium" numberOfLines={3}>
          {title ?? host}
        </Text>
        <Text size="xs" tone="faint" numberOfLines={1}>
          {url}
        </Text>
      </View>
    </Paper>
  );
};

/** A space you can pick: raised paper with its dot; picked, a tint in its own hue with a check. */
const SpaceToggle = ({ space, label, on, a11y, onPress }: { space?: JournalSpace; label?: string; on: boolean; a11y: string; onPress: () => void }) => {
  const t = useTheme();
  const { palette } = t;
  const settle = usePressSettle();
  const hue = space?.color ?? palette.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected: on }}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      onPressIn={settle.onPressIn}
      onPressOut={settle.onPressOut}
      hitSlop={{ top: 6, bottom: 6 }}
    >
      <Animated.View
        style={[
          styles.chip,
          on
            ? { backgroundColor: mix(hue, palette.paper, palette.dark ? 0.3 : 0.18), boxShadow: `0 0 0 1.5px ${alpha(hue, 0.7)}, ${t.glow(hue)}` }
            : { backgroundColor: palette.paper, boxShadow: t.objectShadow },
          settle.style,
        ]}
      >
        {on ? <Check size={14} color={palette.ink} strokeWidth={2.75} /> : <View style={[styles.dot, { backgroundColor: hue }]} />}
        <Text size="xs" weight={on ? 'heavy' : 'medium'} numberOfLines={1}>
          {label ?? space?.name}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

const NoteToggle = ({ on, onPress }: { on: boolean; onPress: () => void }) => {
  const t = useTheme();
  const { palette } = t;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Save as a note"
      accessibilityState={{ selected: on }}
      hitSlop={8}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={[styles.noteToggle, { borderRadius: t.radius.s, backgroundColor: on ? palette.tint : 'transparent' }]}
    >
      <FileText size={18} color={on ? palette.tintInk : palette.muted} strokeWidth={on ? 2.25 : 1.75} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 17, paddingBottom: 10 },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  body: { paddingHorizontal: 17, paddingBottom: 17, gap: 16 },
  card: { padding: 14, gap: 6 },
  link: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  favicon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  faviconImage: { position: 'absolute', width: 24, height: 24 },
  flex: { flex: 1, minWidth: 0 },
  textField: { minHeight: 88, maxHeight: 220, padding: 0, textAlignVertical: 'top' },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noteToggle: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  section: { gap: 8 },
  note: { minHeight: 64, maxHeight: 140, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' },
  // Edge to edge, so a picked chip's glow isn't clipped at the sheet's margin.
  chipRail: { marginHorizontal: -17 },
  chips: { gap: 8, paddingVertical: 6, paddingHorizontal: 17, alignItems: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 13, borderRadius: 9999, maxWidth: 220 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  signedOut: { gap: 10, paddingVertical: 16 },
  footer: { paddingHorizontal: 17, paddingTop: 8 },
});
