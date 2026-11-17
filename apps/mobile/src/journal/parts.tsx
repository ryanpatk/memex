import { createContext, memo, useContext, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Check } from 'lucide-react-native';
import {
  getHostname,
  getLinkTitle,
  markdownExcerpt,
  noteDisplayTitle,
  type Entry,
  type Filer,
  type JournalSpace,
  type Part,
  type Run,
} from '@memex/core';
import { MemoryCard, type CardLabel } from '../cards/MemoryCard';
import { SuggestPill } from '../cards/Pills';
import { useCards } from '../cards/useCards';
import { pictureRatio } from '../data/library';
import { usePressSettle } from '../ui/Pressable';
import { SpaceChip } from '../ui/SpaceChip';
import { Text } from '../ui/Text';
import { entryLabel, type EntryActions } from './useEntryActions';
import { entryMenuItems, showEntryMenu } from './entryMenu';

/*
 * Journal entries on the phone (decision 11D in Memory Cards, m01; web:
 * components/journal/JournalParts.tsx): jots are big paper bubbles, links
 * and notes are memory cards whose label strip names their space, tasks are
 * lines with the big check, and a run of platform saves stays a gallery.
 * Filing (decision 13) sits under each entry: its spaces as strips, and a
 * dashed one-press “File in …?” when the filer has a likely one. Tap a card
 * to open it, tap a task's box to tick it, long-press anything for its menu
 * (the same actions are VoiceOver actions).
 */

export interface FeedContextValue {
  actions: EntryActions;
  filer?: Filer;
  spaces: JournalSpace[];
}

export const FeedContext = createContext<FeedContextValue | null>(null);

const useFeed = () => {
  const value = useContext(FeedContext);
  if (!value) throw new Error('Feed parts need <FeedContext>');
  return value;
};

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const time = (iso: string) => timeFmt.format(new Date(iso));

/** What an entry's label strip says (its first space, plus how many more). */
const labelOf = (entry: Entry): CardLabel =>
  entry.spaces.length ? { name: entry.spaces[0].name, color: entry.spaces[0].color, extra: entry.spaces.length - 1 } : { name: null, color: null };

/** Long-press menu + VoiceOver actions for an entry. */
const useEntryMenu = (entry: Entry) => {
  const { actions, spaces } = useFeed();
  const items = entryMenuItems(entry, spaces, actions);
  return {
    onLongPress: () => showEntryMenu(entry, entryLabel(entry), spaces, actions),
    delayLongPress: 350,
    accessibilityActions: items.map((i) => ({ name: i.name, label: i.label })),
    onAccessibilityAction: (e: AccessibilityActionEvent) => items.find((i) => i.name === e.nativeEvent.actionName)?.run(),
  };
};

/* ------------------------------------------------------------------ */

/** The filer's guess (d23): a 44px dashed strip asking “File in Kyoto trip?”. */
const SuggestionChip = ({ entry }: { entry: Exclude<Entry, { kind: 'jot' }> }) => {
  const { actions, filer } = useFeed();
  const suggestion = filer?.suggest(entry);
  if (!suggestion || entry.id.includes(':temp-')) return null;
  const { space, reason } = suggestion;
  return <SuggestPill name={space.name} color={space.color} hint={reason} onPress={() => void actions.file(entry, space)} />;
};

const Filing = ({ entry }: { entry: Entry }) => {
  const { filer } = useFeed();
  const suggest = entry.kind !== 'jot' && !entry.spaces.length && Boolean(filer?.suggest(entry));
  if (!entry.spaces.length && !suggest) return null;
  return (
    <View style={styles.filing}>
      {entry.spaces.map((s) => (
        <SpaceChip key={s.id} space={s} />
      ))}
      {suggest && <SuggestionChip entry={entry as Exclude<Entry, { kind: 'jot' }>} />}
    </View>
  );
};

/* ------------------------------------------------------------------ */

const DaySeparator = ({ label }: { label: string }) => {
  const c = useCards();
  return (
    <Text size="xl" weight="heavy" accessibilityRole="header" style={[styles.day, { color: c.colors.muted }]}>
      {label}
    </Text>
  );
};

/** A jot (d23, m01): a big paper bubble, the time inline. */
const Jot = ({ entry }: { entry: Extract<Entry, { kind: 'jot' }> }) => {
  const c = useCards();
  const menu = useEntryMenu(entry);
  const pending = entry.jot.id.startsWith('temp-');
  return (
    <View style={styles.block}>
      <Pressable {...menu} accessibilityLabel={`Jot at ${time(entry.at)}: ${entry.jot.body}`} style={styles.bubbleHit}>
        {({ pressed }) => (
          <View
            style={[
              styles.bubble,
              {
                backgroundColor: c.colors.paper,
                boxShadow: pressed ? c.softShadow : c.cardShadow,
                opacity: pending ? 0.7 : 1,
                transform: pressed ? [{ scale: 0.98 }] : undefined,
              },
            ]}
          >
            <Text size="m" weight="medium" style={styles.jotText}>
              {entry.jot.body}
              <Text size="xs" tone="faint" numeric>
                {'  '}
                {pending ? 'Sending…' : time(entry.at)}
              </Text>
            </Text>
          </View>
        )}
      </Pressable>
      <Filing entry={entry} />
    </View>
  );
};

/** A link as a memory card (picture or favicon), its label naming the space. */
const LinkCard = ({ entry }: { entry: Extract<Entry, { kind: 'link' }> }) => {
  const { actions } = useFeed();
  const menu = useEntryMenu(entry);
  const [failed, setFailed] = useState(false);
  const link = entry.link;
  const title = getLinkTitle(link);
  const host = getHostname(link.url).replace(/^www\./, '');
  const ratio = failed ? null : pictureRatio(link);
  return (
    <View style={[styles.block, styles.cardWrap]}>
      <View style={styles.fill}>
        <MemoryCard
          kind={ratio ? 'picture' : 'link'}
          title={title}
          label={labelOf(entry)}
          meta={entry.source.key === 'web' ? host : entry.source.key === 'pinterest' ? 'pinterest' : entry.source.label}
          picture={ratio && link.preview_image_url ? { uri: link.preview_image_url, ratio: Math.min(ratio, 0.75), key: link.id } : undefined}
          favicon={{ uri: link.favicon_url, letter: host.slice(0, 1).toUpperCase() }}
          onPress={() => actions.openLink(link.id)}
          onLongPress={menu.onLongPress}
          onPictureError={() => setFailed(true)}
          accessibilityLabel={`${title}, ${host}`}
        />
      </View>
      {!entry.spaces.length && <Filing entry={entry} />}
    </View>
  );
};

const tileSize = (source: string) => (source === 'pinterest' ? { width: 132, height: 176 } : { width: 220, height: 138 });

const Picture = ({ entry, width, height }: { entry: Extract<Entry, { kind: 'link' }>; width: number; height: number }) => {
  const c = useCards();
  const { actions } = useFeed();
  const menu = useEntryMenu(entry);
  const link = entry.link;
  return (
    <Pressable onPress={() => actions.openLink(link.id)} {...menu} accessibilityRole="link" accessibilityLabel={getLinkTitle(link)}>
      {({ pressed }) => (
        <View
          style={[
            styles.tile,
            { width, height, backgroundColor: c.colors.well, boxShadow: c.softShadow, transform: pressed ? [{ scale: 0.97 }] : undefined },
          ]}
        >
          <Image source={link.preview_image_url} style={StyleSheet.absoluteFill} contentFit="cover" transition={160} accessibilityIgnoresInvertColors />
        </View>
      )}
    </Pressable>
  );
};

/** A run of saves from one platform: one gallery of pictures. */
const Gallery = ({ run }: { run: Run }) => {
  const size = tileSize(run.source.key);
  const spaces = [...new Map(run.entries.flatMap((e) => e.spaces).map((s) => [s.id, s])).values()];
  return (
    <View style={styles.block}>
      <Text size="xs" weight="heavy" tone="muted" numeric style={styles.galleryHead}>
        {run.entries.length} {run.source.many} from {run.source.label} · {time(run.at)}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow} style={styles.galleryScroll}>
        {run.entries.map((e) => (
          <Picture key={e.id} entry={e} {...size} />
        ))}
      </ScrollView>
      {spaces.length > 0 && (
        <View style={styles.filing}>
          {spaces.map((s) => (
            <SpaceChip key={s.id} space={s} />
          ))}
        </View>
      )}
    </View>
  );
};

/** A note as a memory card tinted from its space. */
const NoteCard = ({ entry }: { entry: Extract<Entry, { kind: 'note' }> }) => {
  const { actions } = useFeed();
  const menu = useEntryMenu(entry);
  const title = noteDisplayTitle(entry.note);
  const excerpt = markdownExcerpt(entry.note.body ?? '', 120);
  return (
    <View style={[styles.block, styles.cardWrap]}>
      <View style={styles.fill}>
        <MemoryCard
          kind="note"
          title={title}
          excerpt={excerpt && excerpt !== title ? excerpt : undefined}
          label={labelOf(entry)}
          meta="note"
          onPress={() => actions.openNote(entry.note.id)}
          onLongPress={menu.onLongPress}
          accessibilityLabel={`Note: ${title}`}
        />
      </View>
      {!entry.spaces.length && <Filing entry={entry} />}
    </View>
  );
};

/** The task check (s09 `.chk`): a 40px molded box; done fills green with a white tick. */
export const TaskCheck = ({ done, onPress, label }: { done: boolean; onPress: () => void; label: string }) => {
  const c = useCards();
  const settle = usePressSettle();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={settle.onPressIn}
      onPressOut={settle.onPressOut}
      hitSlop={4}
      testID="task-check"
    >
      <Animated.View
        style={[
          styles.check,
          done
            ? { backgroundColor: c.colors.ok, boxShadow: c.molded() }
            : { backgroundColor: c.colors.paper, boxShadow: `inset 0 0 0 3px ${c.colors.line}, inset 0 -3px 0 0 ${c.colors.line}` },
          settle.style,
        ]}
      >
        {done && <Check size={22} color="#ffffff" strokeWidth={3} />}
      </Animated.View>
    </Pressable>
  );
};

const TaskLine = ({ entry }: { entry: Extract<Entry, { kind: 'task' }> }) => {
  const { actions } = useFeed();
  const menu = useEntryMenu(entry);
  const done = entry.task.is_done;
  return (
    <View style={styles.block}>
      <View style={styles.taskLine}>
        <TaskCheck done={done} label={entry.task.title} onPress={() => void actions.toggleTask(entry.task)} />
        <Pressable {...menu} accessibilityLabel={`Task: ${entry.task.title}`} style={styles.taskText}>
          <Text size="m" weight="heavy" tone={done ? 'faint' : 'ink'} style={done && styles.struck}>
            {entry.task.title}
          </Text>
        </Pressable>
        <Text size="xxs" tone="faint" numeric>
          {time(entry.at)}
        </Text>
      </View>
      <Filing entry={entry} />
    </View>
  );
};

export const FeedPart = memo(function FeedPart({ part }: { part: Part }) {
  switch (part.kind) {
    case 'day':
      return <DaySeparator label={part.label} />;
    case 'run':
      return <Gallery run={part} />;
    case 'jot':
      return <Jot entry={part} />;
    case 'link':
      return <LinkCard entry={part} />;
    case 'note':
      return <NoteCard entry={part} />;
    case 'task':
      return <TaskLine entry={part} />;
  }
});

const styles = StyleSheet.create({
  block: { gap: 8, alignItems: 'flex-start' },
  fill: { alignSelf: 'stretch' },
  filing: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 2, alignItems: 'center' },
  day: { fontSize: 24, lineHeight: 30, marginTop: 16, marginBottom: 8 },
  bubbleHit: { maxWidth: '92%' },
  bubble: { paddingHorizontal: 22, paddingVertical: 14, borderRadius: 28 },
  jotText: { fontSize: 20, lineHeight: 28, fontFamily: 'Inter_600SemiBold' },
  cardWrap: { alignSelf: 'stretch', gap: 10 },
  tile: { borderRadius: 16, overflow: 'hidden' },
  galleryHead: { paddingLeft: 2 },
  galleryScroll: { marginHorizontal: -20, alignSelf: 'stretch' },
  galleryRow: { gap: 10, paddingHorizontal: 20, paddingVertical: 6 },
  taskLine: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingLeft: 2, paddingRight: 4, width: '100%' },
  check: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  taskText: { flex: 1, minWidth: 0 },
  struck: { textDecorationLine: 'line-through' },
});
