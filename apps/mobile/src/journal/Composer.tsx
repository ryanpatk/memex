import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowUp, FileText, Plus } from 'lucide-react-native';
import { parseComposer, type ComposerResult, type Filer, type JournalSpace } from '@memex/core';
import { alpha, mix } from '../theme/palette';
import { typeRole, useTheme } from '../theme/theme';
import { usePressSettle } from '../ui/Pressable';
import { Text } from '../ui/Text';
import { KIND_HINT, SEND_LABEL, appendMention, draftSuggestion, insertMention, pickerFor } from './composerModel';

/*
 * The Journal composer (decision 16A: above the tab bar). One field; what you
 * type decides what send makes, with core's parseComposer, exactly as on the
 * web: plain text → jot, a lone URL → link, "[] " → task, "@Space" files it.
 * The phone has no ⌘↵, so the page button switches to a note (and lets
 * Return make new lines). Above the field: the @ picker while you type a
 * mention, the spaces it'll be filed in, or the filer's suggestion for the
 * draft (one press adds the @mention).
 */

export interface ComposerProps {
  spaces: JournalSpace[];
  filer?: Filer;
  /** Resolves when saved; rejecting puts the text back. */
  onSubmit: (result: Exclude<ComposerResult, { kind: 'empty' }>) => Promise<unknown>;
  /** Text to start with (a `?draft=` deep link). */
  draft?: string;
  /** The dock's top edge in window coordinates, whenever it moves (keyboard, growing text). */
  onTop?: (y: number) => void;
  now?: () => Date;
}

const systemNow = () => new Date();
const MIN_INPUT = 44;
const MAX_INPUT = 132;
const INPUT_PAD = 22;

export const Composer = ({ spaces, filer, onSubmit, draft, onTop, now = systemNow }: ComposerProps) => {
  const t = useTheme();
  const { palette } = t;
  const [text, setText] = useState(draft ?? '');
  const [caret, setCaret] = useState((draft ?? '').length);
  const [asNote, setAsNote] = useState(false);
  const [focused, setFocused] = useState(false);
  // iOS doesn't shrink a multiline field when its text is cleared in code, so
  // the height follows the content explicitly.
  const [contentHeight, setContentHeight] = useState(0);
  const inputHeight = text ? Math.min(MAX_INPUT, Math.max(MIN_INPUT, Math.ceil(contentHeight) + INPUT_PAD)) : MIN_INPUT;
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  const dock = useRef<ComponentRef<typeof View>>(null);
  const send = usePressSettle();

  // A new ?draft= replaces the text (adjusting state during render, not in an effect).
  const [seenDraft, setSeenDraft] = useState(draft);
  if (draft !== seenDraft) {
    setSeenDraft(draft);
    if (draft !== undefined) {
      setText(draft);
      setCaret(draft.length);
    }
  }

  const parsed = useMemo(() => parseComposer(text, spaces, asNote), [asNote, spaces, text]);
  const picker = useMemo(() => pickerFor(text, caret, spaces), [caret, spaces, text]);
  // Recomputed per keystroke, but the filer caches by draft text.
  const suggestion = useMemo(() => (picker ? undefined : draftSuggestion(parsed, filer, now())), [filer, now, parsed, picker]);
  const kind = parsed.kind === 'empty' ? (asNote ? 'note' : 'jot') : parsed.kind;
  const empty = parsed.kind === 'empty';

  const moveCaret = (next: { text: string; caret: number }) => {
    setText(next.text);
    setCaret(next.caret);
    requestAnimationFrame(() => field.current?.setSelection?.(next.caret, next.caret));
  };

  const submit = () => {
    if (parsed.kind === 'empty') {
      field.current?.focus();
      return;
    }
    const saved = text;
    setText('');
    setCaret(0);
    setAsNote(false);
    onSubmit(parsed).catch(() => setText((current) => current || saved));
  };

  const filedTo = parsed.spaces;
  const showHint = focused || !empty;

  return (
    <View
      ref={dock}
      style={[styles.dock, { backgroundColor: palette.paper, boxShadow: `inset 0 1px 0 0 ${palette.lit}, 0 -1px 0 0 ${palette.dark ? '#ffffff12' : '#1d21270f'}` }]}
      onLayout={() => dock.current?.measureInWindow((_x: number, y: number) => onTop?.(y))}
    >
      {(picker || filedTo.length > 0 || suggestion) && (
        <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(100)}>
          <ScrollView
            horizontal
            keyboardShouldPersistTaps="always"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            accessibilityLabel={picker ? 'Spaces' : undefined}
          >
            {picker
              ? picker.matches.map((space) => (
                  <ChipButton
                    key={space.id}
                    space={space}
                    label={space.name}
                    a11y={`File in ${space.name}`}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      moveCaret(insertMention(text, caret, picker.query, space));
                    }}
                  />
                ))
              : filedTo.length > 0
                ? filedTo.map((space) => {
                    const hue = spaces.find((s) => s.id === space.id)?.color ?? palette.accent;
                    return (
                      <View
                        key={space.id}
                        style={[styles.chip, { backgroundColor: mix(hue, palette.paper, palette.dark ? 0.22 : 0.14), boxShadow: `0 0 0 1px ${alpha(hue, 0.3)}` }]}
                        accessible
                        accessibilityLabel={`Will be filed in ${space.name}`}
                      >
                        <View style={[styles.dot, { backgroundColor: hue }]} />
                        <Text size="xs" weight="medium" tone="soft" numberOfLines={1}>
                          → {space.name}
                        </Text>
                      </View>
                    );
                  })
                : suggestion && (
                    <View style={styles.suggestionRow}>
                      <ChipButton
                        space={suggestion.space}
                        label={suggestion.space.name}
                        dashed
                        a11y={`File in ${suggestion.space.name}? ${suggestion.reason}`}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          moveCaret(appendMention(text, suggestion.space));
                        }}
                      />
                      <Text size="xxs" tone="muted" numberOfLines={1} style={styles.reason}>
                        {suggestion.reason}
                      </Text>
                    </View>
                  )}
          </ScrollView>
        </Animated.View>
      )}

      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Write a note"
          accessibilityHint="Saves a note instead of a jot; Return makes new lines"
          accessibilityState={{ selected: asNote }}
          hitSlop={4}
          onPress={() => {
            void Haptics.selectionAsync();
            setAsNote((v) => !v);
            field.current?.focus();
          }}
          style={[
            styles.side,
            {
              borderRadius: t.radius.m,
              backgroundColor: asNote ? palette.tint : 'transparent',
              boxShadow: asNote ? `0 0 0 1px ${alpha(palette.accent, 0.35)}` : undefined,
            },
          ]}
        >
          <FileText size={20} color={asNote ? palette.tintInk : palette.muted} strokeWidth={asNote ? 2.25 : 1.75} />
        </Pressable>

        <TextInput
          ref={field}
          value={text}
          multiline
          submitBehavior={asNote ? 'newline' : 'submit'}
          returnKeyType={asNote ? 'default' : 'send'}
          enablesReturnKeyAutomatically
          onSubmitEditing={() => !asNote && submit()}
          onChangeText={setText}
          onContentSizeChange={(e) => setContentHeight(e.nativeEvent.contentSize.height)}
          onSelectionChange={(e) => setCaret(e.nativeEvent.selection.start)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={asNote ? 'Title on the first line…' : 'Jot, paste a link, “[] ” for a task…'}
          placeholderTextColor={palette.faint}
          selectionColor={palette.accent}
          autoCorrect
          accessibilityLabel="Write in your Journal"
          accessibilityHint="Plain text saves a jot, a link saves the link, start with [] for a task, type @ to file in a space"
          style={[
            typeRole('m'),
            styles.input,
            {
              height: inputHeight,
              color: palette.ink,
              backgroundColor: palette.well,
              borderRadius: t.radius.l,
              boxShadow: palette.dark
                ? `inset 0 1px 2px 0 #13171d33, inset 0 -1px 0 0 #f9fafb1f, 0 0 0 2px ${focused ? alpha(palette.accent, 0.55) : 'transparent'}`
                : `inset 0 1px 2px 0 #1d212714, inset 0 -1px 0 0 #ffffff59, 0 0 0 2px ${focused ? alpha(palette.accent, 0.45) : 'transparent'}`,
            },
          ]}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={SEND_LABEL[kind]}
          accessibilityState={{ disabled: empty }}
          onPressIn={send.onPressIn}
          onPressOut={send.onPressOut}
          onPress={() => {
            if (!empty) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            submit();
          }}
          hitSlop={4}
          testID="composer-send"
        >
          <Animated.View
            style={[
              styles.side,
              styles.send,
              {
                backgroundColor: empty ? palette.well : palette.accent,
                boxShadow: empty ? undefined : `${t.objectShadow}, ${t.glow(palette.accent)}`,
              },
              send.style,
            ]}
          >
            {!empty && (
              <LinearGradient
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, styles.sendGloss]}
                colors={['#ffffff4d', '#ffffff24', '#ffffff00', '#0000000f']}
                locations={[0, 0.46, 0.54, 1]}
              />
            )}
            {kind === 'task' && !empty ? (
              <Plus size={20} color={palette.onAccent} strokeWidth={2.5} />
            ) : (
              <ArrowUp size={20} color={empty ? palette.faint : palette.onAccent} strokeWidth={2.5} />
            )}
          </Animated.View>
        </Pressable>
      </View>

      {showHint && (
        <View style={styles.hint} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text size="xxs" weight="heavy" tone={empty ? 'faint' : 'accent'}>
            {KIND_HINT[kind]}
          </Text>
          <Text size="xxs" tone="muted" numberOfLines={1} style={styles.hintRest}>
            {empty
              ? asNote
                ? 'First line is the title'
                : '“[] ” task · a link saves it · @ files it'
              : filedTo.length
                ? `in ${filedTo.map((s) => s.name).join(', ')}`
                : asNote
                  ? 'Return adds a line'
                  : 'Return sends'}
          </Text>
        </View>
      )}
    </View>
  );
};

const ChipButton = ({
  space,
  label,
  a11y,
  dashed,
  onPress,
}: {
  space: JournalSpace;
  label: string;
  a11y: string;
  dashed?: boolean;
  onPress: () => void;
}) => {
  const t = useTheme();
  const { palette } = t;
  const settle = usePressSettle();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} onPressIn={settle.onPressIn} onPressOut={settle.onPressOut}>
      <Animated.View
        style={[
          styles.chip,
          dashed
            ? { borderWidth: 1, borderStyle: 'dashed', borderColor: alpha(space.color, 0.7), backgroundColor: mix(space.color, palette.paper, 0.06) }
            : { backgroundColor: palette.paper, boxShadow: t.objectShadow },
          settle.style,
        ]}
      >
        <View style={[styles.dot, { backgroundColor: space.color }]} />
        <Text size="xs" weight="medium" numberOfLines={1}>
          {label}
          {dashed ? '?' : ''}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  dock: { paddingTop: 8, paddingBottom: 6, gap: 6 },
  chips: { gap: 6, paddingHorizontal: 12, alignItems: 'center', minHeight: 32 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 30, paddingHorizontal: 10, borderRadius: 9999, maxWidth: 220 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reason: { maxWidth: 220 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 8 },
  side: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  send: { borderRadius: 22 },
  sendGloss: { borderRadius: 22 },
  input: { flex: 1, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11 },
  hint: { flexDirection: 'row', gap: 6, paddingHorizontal: 64, alignItems: 'center' },
  hintRest: { flex: 1 },
});
