import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Plus } from 'lucide-react-native';
import { parseTaskInput, type JournalSpace } from '@memex/core';
import { pickerFor, insertMention } from '../journal/composerModel';
import { alpha } from '../theme/palette';
import { typeRole, useTheme } from '../theme/theme';
import { usePressSettle } from '../ui/Pressable';
import { Text } from '../ui/Text';

/*
 * The Tasks screen's add field (web: TaskComposer): the composer's syntax
 * through core's parseTaskInput, so `@Space` files the task (with the same
 * picker) and a leading “[] ” is optional. When the filter holds one space,
 * a task without `@Space` is filed there; the hint says where it's going.
 */
export const TaskAdd = ({
  spaces,
  defaultSpace,
  onAdd,
}: {
  spaces: JournalSpace[];
  defaultSpace?: JournalSpace;
  /** Resolves when saved; rejecting puts the text back. */
  onAdd: (title: string, spaces: JournalSpace[]) => Promise<unknown>;
}) => {
  const t = useTheme();
  const { palette } = t;
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  const settle = usePressSettle();
  const parsed = useMemo(() => parseTaskInput(text, spaces), [spaces, text]);
  const picker = useMemo(() => pickerFor(text, caret, spaces), [caret, spaces, text]);
  const filed = parsed?.spaces.length ? parsed.spaces : defaultSpace ? [defaultSpace] : [];

  const submit = () => {
    if (!parsed) {
      field.current?.focus();
      return;
    }
    const saved = text;
    setText('');
    setCaret(0);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAdd(parsed.title, filed).catch(() => setText((current) => current || saved));
  };

  return (
    <View style={styles.root}>
      <View style={styles.row}>
        <TextInput
          ref={field}
          value={text}
          onChangeText={setText}
          onSelectionChange={(e) => setCaret(e.nativeEvent.selection.start)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={submit}
          submitBehavior="submit"
          returnKeyType="done"
          enablesReturnKeyAutomatically
          placeholder={defaultSpace ? `Add a task to ${defaultSpace.name}…` : 'Add a task, @ files it…'}
          placeholderTextColor={palette.faint}
          selectionColor={palette.accent}
          accessibilityLabel="Add a task"
          accessibilityHint="Type @ and a space's name to file it there"
          style={[
            t.cards ? t.cards.type.body : typeRole('m'),
            styles.input,
            t.cards
              ? {
                  // Memory Cards (s04): the field is a paper pill, ring on focus
                  minHeight: 56,
                  borderRadius: 28,
                  paddingHorizontal: 22,
                  color: t.cards.colors.ink,
                  backgroundColor: t.cards.colors.paper,
                  boxShadow: focused ? `0 0 0 4px ${t.cards.colors.ring}, ${t.cards.softShadow}` : t.cards.softShadow,
                }
              : {
              color: palette.ink,
              backgroundColor: palette.well,
              borderRadius: t.radius.m,
              boxShadow: palette.dark
                ? `inset 0 1px 2px 0 #13171d33, inset 0 -1px 0 0 #f9fafb1f, 0 0 0 2px ${focused ? alpha(palette.accent, 0.55) : 'transparent'}`
                : `inset 0 1px 2px 0 #1d212714, inset 0 -1px 0 0 #ffffff59, 0 0 0 2px ${focused ? alpha(palette.accent, 0.45) : 'transparent'}`,
                },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add task"
          accessibilityState={{ disabled: !parsed }}
          onPress={submit}
          onPressIn={settle.onPressIn}
          onPressOut={settle.onPressOut}
          hitSlop={4}
        >
          <Animated.View
            style={[
              styles.add,
              t.cards
                ? { width: 56, height: 56, borderRadius: 28, backgroundColor: parsed ? t.cards.colors.primary : t.cards.colors.well, boxShadow: parsed ? t.cards.molded() : undefined }
                : { backgroundColor: parsed ? palette.accent : palette.well, boxShadow: parsed ? `${t.objectShadow}, ${t.glow(palette.accent)}` : undefined },
              settle.style,
            ]}
          >
            <Plus size={t.cards ? 26 : 20} color={parsed ? palette.onAccent : palette.faint} strokeWidth={t.cards ? 3 : 2.5} />
          </Animated.View>
        </Pressable>
      </View>
      {picker ? (
        <View style={styles.picker} accessibilityLabel="Spaces">
          {picker.matches.map((space) => (
            <Pressable
              key={space.id}
              accessibilityRole="button"
              accessibilityLabel={`File in ${space.name}`}
              onPress={() => {
                void Haptics.selectionAsync();
                const next = insertMention(text, caret, picker.query, space);
                setText(next.text);
                setCaret(next.caret);
              }}
              style={[
                styles.pick,
                t.cards
                  ? { minHeight: 44, paddingLeft: 6, paddingRight: 16, backgroundColor: t.cards.colors.paper, boxShadow: t.cards.softShadow }
                  : { backgroundColor: palette.paper, boxShadow: t.objectShadow },
              ]}
            >
              <View style={[styles.dot, t.cards && styles.cardsDot, { backgroundColor: space.color }]} />
              <Text size="xs" weight="medium" numberOfLines={1}>
                {space.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (focused || text) && (
        <Text size="xxs" tone="muted" numberOfLines={1} style={styles.hint}>
          {filed.length ? `Goes in ${filed.map((s) => s.name).join(', ')}` : 'Unfiled · type @ to file it in a space'}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, minHeight: 44, paddingHorizontal: 14, paddingVertical: 10 },
  add: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  picker: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 30, paddingHorizontal: 10, borderRadius: 9999 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  cardsDot: { width: 30, height: 30, borderRadius: 15 },
  hint: { paddingHorizontal: 4 },
});
