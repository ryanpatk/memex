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
import { MemoryCard, type CardLabel } from '../cards/MemoryCard';
import { pictureRatio } from '../data/library';
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

/** Memory Cards: what an entry's label strip says (its first space, plus how many more). */
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

const SuggestionChip = ({ entry }: { entry: Exclude<Entry, { kind: 'jot' }> }) => {
  const t = useTheme();
  const { palette } = t;
  const { actions, filer } = useFeed();
  const settle = usePressSettle();
  const suggestion = filer?.suggest(entry);
  if (!suggestion || entry.id.includes(':temp-')) return null;
  const { space, reason } = suggestion;
  if (t.cards) {
    // Memory Cards (d23, m01): a 44px dashed strip asking “File in Kyoto trip?”
    const c = t.cards;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`File in ${space.name}`}
        accessibilityHint={reason}
        onPress={() => void actions.file(entry, space)}
        hitSlop={4}
      >
        {({ pressed }) => (
          <View style={[styles.cardsSuggest, { borderColor: space.color, transform: pressed ? [{ scale: 0.96 }] : undefined }]}>
            <View style={[styles.cardsStripDot, { backgroundColor: space.color }]} />
            <Text size="s" weight="heavy" numberOfLines={1} style={{ color: c.colors.ink, flexShrink: 1 }}>
              File in {space.name}?
            </Text>
          </View>
        )}
      </Pressable>
    );
  }
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
  const { palette, cards } = useTheme();
  if (cards) {
    return (
      <Text size="xl" weight="heavy" accessibilityRole="header" style={[styles.cardsDay, { color: cards.colors.muted, fontSize: 24, lineHeight: 30 }]}>
        {label}
      </Text>
    );
  }
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
  const { palette, cards } = useTheme();
  const menu = useEntryMenu(entry);
  const pending = entry.jot.id.startsWith('temp-');
  if (cards) {
    // Memory Cards (d23, m01): a big paper bubble, the time inline
    return (
      <View style={styles.block}>
        <Pressable {...menu} accessibilityLabel={`Jot at ${time(entry.at)}: ${entry.jot.body}`} style={styles.cardsBubbleHit}>
          {({ pressed }) => (
            <View
              style={[
                styles.cardsBubble,
                {
                  backgroundColor: cards.colors.paper,
                  boxShadow: pressed ? cards.softShadow : cards.cardShadow,
                  opacity: pending ? 0.7 : 1,
                  transform: pressed ? [{ scale: 0.98 }] : undefined,
                },
              ]}
            >
              <Text size="m" weight="medium" style={{ fontSize: 20, lineHeight: 28, fontFamily: 'Inter_600SemiBold' }}>
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
  }
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

/** Memory Cards: a link entry as a memory card (picture or favicon), its label naming the space. */
const LinkCard = ({ entry }: { entry: Extract<Entry, { kind: 'link' }> }) => {
  const { actions } = useFeed();
  const menu = useEntryMenu(entry);
  const [failed, setFailed] = useState(false);
  const link = entry.link;
  const title = getLinkTitle(link);
  const host = getHostname(link.url).replace(/^www\./, '');
  const ratio = failed ? null : pictureRatio(link);
  return (
    <View style={[styles.block, styles.cardsCardWrap]}>
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
  const { palette, cards } = useTheme();
  const { actions } = useFeed();
  const menu = useEntryMenu(entry);
  const title = noteDisplayTitle(entry.note);
  const excerpt = markdownExcerpt(entry.note.body ?? '', 120);
  if (cards) {
    return (
      <View style={[styles.block, styles.cardsCardWrap]}>
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
  }
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
          t.cards
            ? done
              ? { width: 40, height: 40, borderRadius: 12, backgroundColor: t.cards.colors.ok, boxShadow: t.cards.molded() }
              : { width: 40, height: 40, borderRadius: 12, backgroundColor: t.cards.colors.paper, boxShadow: `inset 0 0 0 3px ${t.cards.colors.line}, inset 0 -3px 0 0 ${t.cards.colors.line}` }
            : done
              ? { backgroundColor: palette.success, boxShadow: `${t.objectShadow}, ${t.glow(palette.success)}` }
              : { backgroundColor: palette.paper, boxShadow: t.objectShadow },
          settle.style,
        ]}
      >
        {done && <Check size={t.cards ? 22 : 13} color="#ffffff" strokeWidth={3} />}
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
  const { cards } = useTheme();
  switch (part.kind) {
    case 'day':
      return <DaySeparator label={part.label} />;
    case 'run':
      return <Gallery run={part} />;
    case 'jot':
      return <Jot entry={part} />;
    case 'link':
      if (cards) return <LinkCard entry={part} />;
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
  // Memory Cards
  cardsSuggest: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingLeft: 8, paddingRight: 16, borderRadius: 22, borderWidth: 3, borderStyle: 'dashed', maxWidth: 320 },
  cardsStripDot: { width: 24, height: 24, borderRadius: 12 },
  cardsDay: { marginTop: 16, marginBottom: 8 },
  cardsBubbleHit: { maxWidth: '92%' },
  cardsBubble: { paddingHorizontal: 22, paddingVertical: 14, borderRadius: 28 },
  cardsCardWrap: { alignSelf: 'stretch', gap: 10 },
  reason: { flexShrink: 1 },
});
