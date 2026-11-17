import { useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Plus } from 'lucide-react-native';
import { parseTaskInput, type JournalSpace } from '@memex/core';
import { pickerFor, insertMention } from '../journal/composerModel';
import { SpaceToggle } from '../cards/Pills';
import { useCards } from '../cards/useCards';
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
  const c = useCards();
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
          placeholderTextColor={c.colors.faint}
          selectionColor={c.colors.primary}
          accessibilityLabel="Add a task"
          accessibilityHint="Type @ and a space's name to file it there"
          style={[
            c.type.body,
            styles.input,
            // s04: the field is a paper pill, ring on focus
            { color: c.colors.ink, backgroundColor: c.colors.paper, boxShadow: focused ? `0 0 0 4px ${c.colors.ring}, ${c.softShadow}` : c.softShadow },
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
            style={[styles.add, { backgroundColor: parsed ? c.colors.primary : c.colors.well, boxShadow: parsed ? c.molded() : undefined }, settle.style]}
          >
            <Plus size={26} color={parsed ? '#ffffff' : c.colors.faint} strokeWidth={3} />
          </Animated.View>
        </Pressable>
      </View>
      {picker ? (
        <View style={styles.picker} accessibilityLabel="Spaces">
          {picker.matches.map((space) => (
            <SpaceToggle
              key={space.id}
              name={space.name}
              color={space.color}
              on={false}
              accessibilityLabel={`File in ${space.name}`}
              onPress={() => {
                const next = insertMention(text, caret, picker.query, space);
                setText(next.text);
                setCaret(next.caret);
              }}
            />
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
  root: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, minHeight: 56, borderRadius: 28, paddingHorizontal: 22, paddingVertical: 14 },
  add: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  picker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { paddingHorizontal: 6 },
});
