import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ArrowUp, FileText, Plus } from 'lucide-react-native';
import { parseComposer, withDefaultSpace, type ComposerResult, type Filer, type JournalSpace } from '@memex/core';
import { SpaceToggle, SuggestPill } from '../cards/Pills';
import { useCards } from '../cards/useCards';
import { SpaceChip } from '../ui/SpaceChip';
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
  /** A space's screen: what you send is filed there unless it names its own @spaces. */
  space?: JournalSpace;
  now?: () => Date;
}

const systemNow = () => new Date();
const MIN_INPUT = 56;
const MAX_INPUT = 132;
const INPUT_PAD = 22;

export const Composer = ({ spaces, filer, onSubmit, draft, onTop, space, now = systemNow }: ComposerProps) => {
  const c = useCards();
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

  const parsed = useMemo(() => withDefaultSpace(parseComposer(text, spaces, asNote), space), [asNote, space, spaces, text]);
  const picker = useMemo(() => pickerFor(text, caret, spaces), [caret, spaces, text]);
  // Recomputed per keystroke, but the filer caches by draft text.
  const suggestion = useMemo(() => (picker ? undefined : draftSuggestion(parsed, filer, now())), [filer, now, parsed, picker]);
  // On a space's screen its own chip would always show; the hint says it instead.
  const named = space ? parsed.spaces.filter((s) => s.id !== space.id) : parsed.spaces;
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

  const filedTo = named;
  const showHint = focused || !empty || Boolean(space);

  return (
    <View ref={dock} style={styles.dock} onLayout={() => dock.current?.measureInWindow((_x: number, y: number) => onTop?.(y))}>
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
                  <SpaceToggle
                    key={space.id}
                    name={space.name}
                    color={space.color}
                    on={false}
                    accessibilityLabel={`File in ${space.name}`}
                    onPress={() => moveCaret(insertMention(text, caret, picker.query, space))}
                  />
                ))
              : filedTo.length > 0
                ? filedTo.map((filed) => {
                    const space = spaces.find((s) => s.id === filed.id);
                    return space ? (
                      <View key={space.id} accessible accessibilityLabel={`Will be filed in ${space.name}`}>
                        <SpaceChip space={space} />
                      </View>
                    ) : null;
                  })
                : suggestion && (
                    <SuggestPill
                      name={suggestion.space.name}
                      color={suggestion.space.color}
                      accessibilityLabel={`File in ${suggestion.space.name}? ${suggestion.reason}`}
                      onPress={() => {
                        void Haptics.selectionAsync();
                        moveCaret(appendMention(text, suggestion.space));
                      }}
                    />
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
          style={[styles.side, { backgroundColor: asNote ? c.colors.ink : c.colors.paper, boxShadow: asNote ? undefined : c.softShadow }]}
        >
          <FileText size={22} color={asNote ? c.colors.paper : c.colors.muted} strokeWidth={2.5} />
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
          placeholder={asNote ? 'Title on the first line…' : space ? `Jot in ${space.name}, paste a link…` : 'Jot, paste a link, [] task…'}
          placeholderTextColor={c.colors.faint}
          selectionColor={c.colors.primary}
          autoCorrect
          accessibilityLabel={space ? `Write in ${space.name}` : 'Write in your Journal'}
          accessibilityHint="Plain text saves a jot, a link saves the link, start with [] for a task, type @ to file in a space"
          style={[
            c.type.body,
            styles.input,
            {
              // s04: the save field is a paper pill, ring on focus
              height: Math.max(56, inputHeight),
              color: c.colors.ink,
              backgroundColor: c.colors.paper,
              boxShadow: focused ? `0 0 0 4px ${c.colors.ring}, ${c.cardShadow}` : c.cardShadow,
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
            style={[styles.side, { backgroundColor: empty ? c.colors.well : c.colors.primary, boxShadow: empty ? undefined : c.molded() }, send.style]}
          >
            {kind === 'task' && !empty ? (
              <Plus size={24} color="#ffffff" strokeWidth={3} />
            ) : (
              <ArrowUp size={24} color={empty ? c.colors.faint : '#ffffff'} strokeWidth={3} />
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
                : space
                  ? `in ${space.name} · “[] ” task · @ files elsewhere`
                  : '“[] ” task · a link saves it · @ files it'
              : parsed.spaces.length
                ? `in ${parsed.spaces.map((s) => s.name).join(', ')}`
                : asNote
                  ? 'Return adds a line'
                  : 'Return sends'}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  dock: { paddingTop: 8, paddingBottom: 10, paddingHorizontal: 4, gap: 8 },
  chips: { gap: 8, paddingHorizontal: 12, alignItems: 'center', minHeight: 44 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 8 },
  side: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, borderRadius: 28, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, lineHeight: 24 },
  hint: { flexDirection: 'row', gap: 6, paddingHorizontal: 76, alignItems: 'center' },
  hintRest: { flex: 1 },
});
