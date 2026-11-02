import { createContext, memo, useContext, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Check, FileText } from 'lucide-react-native';
import {
  getHostname,
  getLinkTitle,
  isVisualLink,
  markdownExcerpt,
  noteDisplayTitle,
  type Entry,
  type Filer,
  type JournalSpace,
  type LinkWithTag,
  type Part,
  type Run,
} from '@memex/core';
import { alpha, mix } from '../theme/palette';
import { useTheme } from '../theme/theme';
import { Paper } from '../ui/Paper';
import { usePressSettle } from '../ui/Pressable';
import { SpaceChip } from '../ui/SpaceChip';
import { Text } from '../ui/Text';
import { entryLabel, type EntryActions } from './useEntryActions';
import { entryMenuItems, showEntryMenu } from './entryMenu';

/*
 * Journal entries on the phone, decision 11D (web: components/journal/
 * JournalParts.tsx): jots are bubbles, tasks are lines, platform saves with
 * pictures stay big (one gallery per run), plain links and notes go compact.
 * Filing (decision 13) sits under each entry: its spaces, and a dashed
 * one-press suggestion when the filer has a likely one. Tap a link for its
 * detail, tap a task's box to tick it, long-press anything for its menu
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

const initials = (host: string) => host.replace(/^www\./, '').slice(0, 2).toUpperCase();

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

const SuggestionChip = ({ entry }: { entry: Exclude<Entry, { kind: 'jot' }> }) => {
  const t = useTheme();
  const { palette } = t;
  const { actions, filer } = useFeed();
  const settle = usePressSettle();
  const suggestion = filer?.suggest(entry);
  if (!suggestion || entry.id.includes(':temp-')) return null;
  const { space, reason } = suggestion;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`File in ${space.name}`}
      accessibilityHint={reason}
      onPress={() => void actions.file(entry, space)}
      onPressIn={settle.onPressIn}
      onPressOut={settle.onPressOut}
      hitSlop={6}
    >
      <Animated.View
        style={[
          styles.suggested,
          { borderColor: alpha(space.color, 0.75), backgroundColor: mix(space.color, palette.paper, palette.dark ? 0.1 : 0.05) },
          settle.style,
        ]}
      >
        <View style={[styles.dot, { backgroundColor: space.color }]} />
        <Text size="xs" weight="medium" tone="soft" numberOfLines={1} style={styles.suggestedLabel}>
          {space.name}?
        </Text>
        <Text size="xxs" tone="muted" numberOfLines={1} style={styles.reason}>
          {reason}
        </Text>
      </Animated.View>
    </Pressable>
  );
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

const Favicon = ({ link }: { link: LinkWithTag }) => {
  const { palette } = useTheme();
  const [failed, setFailed] = useState(false);
  return (
    <View style={[styles.fav, { backgroundColor: palette.well }]}>
      {link.favicon_url && !failed ? (
        <Image source={link.favicon_url} style={styles.favImg} onError={() => setFailed(true)} accessibilityIgnoresInvertColors />
      ) : (
        <Text size="xxs" weight="heavy" tone="muted">
          {initials(getHostname(link.url))}
        </Text>
      )}
    </View>
  );
};

/** A row you read that also opens something: paper that tints on press, never moves. */
const PaperRow = ({ entry, onPress, label, children }: { entry: Entry; onPress?: () => void; label: string; children: ReactNode }) => {
  const { palette } = useTheme();
  const menu = useEntryMenu(entry);
  return (
    <Pressable onPress={onPress} {...menu} accessibilityRole={onPress ? 'link' : undefined} accessibilityLabel={label} style={styles.fill}>
      {({ pressed }) => (
        <Paper style={[styles.row, pressed && { backgroundColor: palette.dark ? palette.well : palette.tint }]}>{children}</Paper>
      )}
    </Pressable>
  );
};

/* ------------------------------------------------------------------ */

const DaySeparator = ({ label }: { label: string }) => {
  const { palette } = useTheme();
  return (
    <View style={styles.day} accessibilityRole="header">
      <View style={[styles.rule, { backgroundColor: palette.hairline }]} />
      <Text size="xs" weight="heavy" tone="muted">
        {label}
      </Text>
      <View style={[styles.rule, { backgroundColor: palette.hairline }]} />
    </View>
  );
};

const Jot = ({ entry }: { entry: Extract<Entry, { kind: 'jot' }> }) => {
  const { palette } = useTheme();
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
                backgroundColor: pressed ? mix(palette.accent, palette.bubble, 0.12) : palette.bubble,
                boxShadow: `inset 0 1px 0 0 ${palette.lit}, 0 0 0 1px ${palette.bubbleRing}`,
                opacity: pending ? 0.7 : 1,
              },
            ]}
          >
            <Text size="m">{entry.jot.body}</Text>
            <Text size="xxs" tone="faint" numeric style={styles.jotTime}>
              {pending ? 'Sending…' : time(entry.at)}
            </Text>
          </View>
        )}
      </Pressable>
      <Filing entry={entry} />
    </View>
  );
};

const LinkCompact = ({ entry }: { entry: Extract<Entry, { kind: 'link' }> }) => {
  const { actions } = useFeed();
  const title = getLinkTitle(entry.link);
  const host = getHostname(entry.link.url).replace(/^www\./, '');
  return (
    <View style={styles.block}>
      <PaperRow entry={entry} onPress={() => actions.openLink(entry.link.id)} label={`${title}, ${host}`}>
        <Favicon link={entry.link} />
        <View style={styles.rowText}>
          <Text size="s" weight="medium" numberOfLines={2}>
            {title}
          </Text>
          <Text size="xs" tone="muted" numeric numberOfLines={1}>
            {host} · {entry.link.id.startsWith('temp-') ? 'Saving…' : time(entry.at)}
          </Text>
        </View>
      </PaperRow>
      <Filing entry={entry} />
    </View>
  );
};

const tileSize = (source: string) =>
  source === 'pinterest' ? { width: 132, height: 176 } : { width: 220, height: 138 };

const Picture = ({ entry, width, height }: { entry: Extract<Entry, { kind: 'link' }>; width: number; height: number }) => {
  const t = useTheme();
  const { actions } = useFeed();
  const menu = useEntryMenu(entry);
  const link = entry.link;
  return (
    <Pressable onPress={() => actions.openLink(link.id)} {...menu} accessibilityRole="link" accessibilityLabel={getLinkTitle(link)}>
      {({ pressed }) => (
        <View style={[styles.tile, { width, height, backgroundColor: t.palette.well, boxShadow: t.paperShadow('s'), opacity: pressed ? 0.85 : 1 }]}>
          <Image source={link.preview_image_url} style={StyleSheet.absoluteFill} contentFit="cover" transition={160} accessibilityIgnoresInvertColors />
        </View>
      )}
    </Pressable>
  );
};

const VisualLink = ({ entry }: { entry: Extract<Entry, { kind: 'link' }> }) => {
  const size = entry.source.key === 'pinterest' ? { width: 210, height: 280 } : { width: 300, height: 170 };
  return (
    <View style={styles.block}>
      <Picture entry={entry} {...size} />
      <View style={styles.caption}>
        <Text size="s" weight="medium" numberOfLines={2}>
          {getLinkTitle(entry.link)}
        </Text>
        <Text size="xs" tone="muted" numeric>
          {entry.source.label} · {time(entry.at)}
        </Text>
      </View>
      <Filing entry={entry} />
    </View>
  );
};

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

const NoteRow = ({ entry }: { entry: Extract<Entry, { kind: 'note' }> }) => {
  const { palette } = useTheme();
  const { actions } = useFeed();
  const title = noteDisplayTitle(entry.note);
  const excerpt = markdownExcerpt(entry.note.body ?? '', 120);
  return (
    <View style={styles.block}>
      <PaperRow entry={entry} onPress={() => actions.openNote(entry.note.id)} label={`Note: ${title}`}>
        <View style={[styles.fav, { backgroundColor: palette.tint }]}>
          <FileText size={16} color={palette.tintInk} strokeWidth={1.75} />
        </View>
        <View style={styles.rowText}>
          <Text size="s" weight="heavy" numberOfLines={1}>
            {title}
          </Text>
          {excerpt && excerpt !== title ? (
            <Text size="xs" tone="soft" numberOfLines={2}>
              {excerpt}
            </Text>
          ) : null}
          <Text size="xs" tone="muted" numeric>
            Note · {time(entry.at)}
          </Text>
        </View>
      </PaperRow>
      <Filing entry={entry} />
    </View>
  );
};

export const TaskCheck = ({ done, onPress, label }: { done: boolean; onPress: () => void; label: string }) => {
  const t = useTheme();
  const { palette } = t;
  const settle = usePressSettle();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={settle.onPressIn}
      onPressOut={settle.onPressOut}
      hitSlop={11}
      testID="task-check"
    >
      <Animated.View
        style={[
          styles.check,
          done
            ? { backgroundColor: palette.success, boxShadow: `${t.objectShadow}, ${t.glow(palette.success)}` }
            : { backgroundColor: palette.paper, boxShadow: t.objectShadow },
          settle.style,
        ]}
      >
        {done && <Check size={13} color="#ffffff" strokeWidth={3} />}
      </Animated.View>
    </Pressable>
  );
};

const TaskLine = ({ entry }: { entry: Extract<Entry, { kind: 'task' }> }) => {
  const { palette } = useTheme();
  const { actions } = useFeed();
  const menu = useEntryMenu(entry);
  const done = entry.task.is_done;
  return (
    <View style={styles.block}>
      <View style={styles.taskLine}>
        <TaskCheck done={done} label={entry.task.title} onPress={() => void actions.toggleTask(entry.task)} />
        <Pressable {...menu} accessibilityLabel={`Task: ${entry.task.title}`} style={styles.taskText}>
          <Text
            size="m"
            tone={done ? 'muted' : 'ink'}
            style={done && { textDecorationLine: 'line-through', textDecorationColor: alpha(palette.muted, 0.6) }}
          >
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
      return isVisualLink(part) ? <VisualLink entry={part} /> : <LinkCompact entry={part} />;
    case 'note':
      return <NoteRow entry={part} />;
    case 'task':
      return <TaskLine entry={part} />;
  }
});

const styles = StyleSheet.create({
  block: { gap: 6, alignItems: 'flex-start' },
  fill: { alignSelf: 'stretch' },
  filing: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 2, alignItems: 'center' },
  day: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  bubbleHit: { maxWidth: '88%' },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderBottomLeftRadius: 4,
  },
  jotTime: { alignSelf: 'flex-end', marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, minHeight: 56 },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  fav: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  favImg: { width: 20, height: 20 },
  tile: { borderRadius: 12, overflow: 'hidden' },
  caption: { gap: 1, maxWidth: 300 },
  galleryHead: { paddingLeft: 2 },
  galleryScroll: { marginHorizontal: -17, alignSelf: 'stretch' },
  galleryRow: { gap: 8, paddingHorizontal: 17, paddingVertical: 4 },
  taskLine: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36, paddingLeft: 2, paddingRight: 4, width: '100%' },
  check: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  taskText: { flex: 1, minWidth: 0 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  suggested: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    minHeight: 26,
    borderRadius: 9999,
    borderWidth: 1,
    borderStyle: 'dashed',
    maxWidth: 320,
  },
  suggestedLabel: { flexShrink: 0 },
  reason: { flexShrink: 1 },
});
