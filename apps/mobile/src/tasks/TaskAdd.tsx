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
            typeRole('m'),
            styles.input,
            {
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
              { backgroundColor: parsed ? palette.accent : palette.well, boxShadow: parsed ? `${t.objectShadow}, ${t.glow(palette.accent)}` : undefined },
              settle.style,
            ]}
          >
            <Plus size={20} color={parsed ? palette.onAccent : palette.faint} strokeWidth={2.5} />
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
              style={[styles.pick, { backgroundColor: palette.paper, boxShadow: t.objectShadow }]}
            >
              <View style={[styles.dot, { backgroundColor: space.color }]} />
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
  hint: { paddingHorizontal: 4 },
});
