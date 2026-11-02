import { memo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Check, FileText } from 'lucide-react-native';
import {
  getHostname,
  getLinkTitle,
  isVisualLink,
  markdownExcerpt,
  noteDisplayTitle,
  type Entry,
  type LinkWithTag,
  type Part,
  type Run,
} from '@memex/core';
import { alpha } from '../theme/palette';
import { useTheme } from '../theme/theme';
import { Paper } from '../ui/Paper';
import { SpaceChip } from '../ui/SpaceChip';
import { Text } from '../ui/Text';

/*
 * Journal entries on the phone, decision 11D (web: components/journal/
 * JournalParts.tsx): jots are bubbles, tasks are lines, platform saves with
 * pictures stay big (one gallery per run), plain links and notes go compact.
 * Read-only for now: links open in the browser, nothing edits.
 */

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const time = (iso: string) => timeFmt.format(new Date(iso));

const openLink = (url: string) => {
  void WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
};

const initials = (host: string) => host.replace(/^www\./, '').slice(0, 2).toUpperCase();

/* ------------------------------------------------------------------ */

const Filing = ({ entry }: { entry: Entry }) =>
  entry.spaces.length ? (
    <View style={styles.filing}>
      {entry.spaces.map((s) => (
        <SpaceChip key={s.id} space={s} />
      ))}
    </View>
  ) : null;

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
const PaperRow = ({ onPress, label, children }: { onPress?: () => void; label: string; children: ReactNode }) => {
  const { palette } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole={onPress ? 'link' : undefined} accessibilityLabel={label}>
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
      <Text size="xs" weight="heavy" tone="muted" style={styles.dayLabel}>
        {label}
      </Text>
      <View style={[styles.rule, { backgroundColor: palette.hairline }]} />
    </View>
  );
};

const Jot = ({ entry }: { entry: Extract<Entry, { kind: 'jot' }> }) => {
  const { palette } = useTheme();
  return (
    <View style={styles.block}>
      <View
        style={[
          styles.bubble,
          { backgroundColor: palette.bubble, boxShadow: `inset 0 1px 0 0 ${palette.lit}, 0 0 0 1px ${palette.bubbleRing}` },
        ]}
        accessibilityLabel={`Jot at ${time(entry.at)}: ${entry.jot.body}`}
      >
        <Text size="m" selectable>
          {entry.jot.body}
        </Text>
        <Text size="xxs" tone="faint" numeric style={styles.jotTime}>
          {time(entry.at)}
        </Text>
      </View>
      <Filing entry={entry} />
    </View>
  );
};

const LinkCompact = ({ entry }: { entry: Extract<Entry, { kind: 'link' }> }) => {
  const title = getLinkTitle(entry.link);
  const host = getHostname(entry.link.url).replace(/^www\./, '');
  return (
    <View style={styles.block}>
      <PaperRow onPress={() => openLink(entry.link.url)} label={`${title}, ${host}`}>
        <Favicon link={entry.link} />
        <View style={styles.rowText}>
          <Text size="s" weight="medium" numberOfLines={2}>
            {title}
          </Text>
          <Text size="xs" tone="muted" numeric numberOfLines={1}>
            {host} · {time(entry.at)}
          </Text>
        </View>
      </PaperRow>
      <Filing entry={entry} />
    </View>
  );
};

const tileSize = (source: string) =>
  source === 'pinterest' ? { width: 132, height: 176 } : { width: 220, height: 138 };

const Picture = ({ link, width, height }: { link: LinkWithTag; width: number; height: number }) => {
  const t = useTheme();
  return (
    <Pressable onPress={() => openLink(link.url)} accessibilityRole="link" accessibilityLabel={getLinkTitle(link)}>
      <View style={[styles.tile, { width, height, backgroundColor: t.palette.well, boxShadow: t.paperShadow('s') }]}>
        <Image
          source={link.preview_image_url}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={160}
          accessibilityIgnoresInvertColors
        />
      </View>
    </Pressable>
  );
};

const VisualLink = ({ entry }: { entry: Extract<Entry, { kind: 'link' }> }) => {
  const size = entry.source.key === 'pinterest' ? { width: 210, height: 280 } : { width: 300, height: 170 };
  return (
    <View style={styles.block}>
      <Picture link={entry.link} {...size} />
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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.galleryRow}
        style={styles.galleryScroll}
      >
        {run.entries.map((e) => (
          <Picture key={e.id} link={e.link} {...size} />
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
  const title = noteDisplayTitle(entry.note);
  const excerpt = markdownExcerpt(entry.note.body ?? '', 120);
  return (
    <View style={styles.block}>
      <PaperRow label={`Note: ${title}`}>
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

const TaskLine = ({ entry }: { entry: Extract<Entry, { kind: 'task' }> }) => {
  const t = useTheme();
  const { palette } = t;
  const done = entry.task.is_done;
  return (
    <View style={styles.block}>
      <View
        style={styles.taskLine}
        accessible
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done, disabled: true }}
        accessibilityLabel={entry.task.title}
      >
        <View
          style={[
            styles.check,
            done
              ? { backgroundColor: palette.success, boxShadow: `${t.objectShadow}, ${t.glow(palette.success)}` }
              : { backgroundColor: palette.paper, boxShadow: t.objectShadow },
          ]}
        >
          {done && <Check size={13} color="#ffffff" strokeWidth={3} />}
        </View>
        <Text
          size="m"
          tone={done ? 'muted' : 'ink'}
          style={[styles.taskText, done && { textDecorationLine: 'line-through', textDecorationColor: alpha(palette.muted, 0.6) }]}
        >
          {entry.task.title}
        </Text>
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
  filing: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 2 },
  day: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  dayLabel: { textTransform: 'none' },
  bubble: {
    maxWidth: '88%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderBottomLeftRadius: 4,
  },
  jotTime: { alignSelf: 'flex-end', marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, minHeight: 56, width: '100%' },
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
});

