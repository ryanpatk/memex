import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Check, ChevronLeft, Compass, Link2Off, Plus, Share as ShareIcon, Trash2 } from 'lucide-react-native';
import {
  getHostname,
  getLinkTitle,
  sourceOf,
  type Entry,
  type Filer,
  type JournalSpace,
  type LinkWithTag,
} from '@memex/core';
import { useRepository } from '../../data/DataProvider';
import { useJournal } from '../../data/useJournal';
import { useEntryActions } from '../../journal/useEntryActions';
import { alpha, mix } from '../../theme/palette';
import { useTheme } from '../../theme/theme';
import { Canvas } from '../../ui/Canvas';
import { Paper } from '../../ui/Paper';
import { Placeholder } from '../../ui/Placeholder';
import { Button, usePressSettle } from '../../ui/Pressable';
import { Text } from '../../ui/Text';
import { useToast } from '../../ui/Toast';

/*
 * Link detail (ROADMAP Phase 6: "link detail; open in browser"): the
 * picture, title, description and where it came from, the spaces it's in
 * (tap a space to file or unfile it; the filer's guess is dashed), open in
 * the in-app Safari, share, delete with Undo.
 */

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const ratioFor = (key: string) => (key === 'pinterest' ? 4 / 5 : key === 'youtube' ? 16 / 9 : 1.6);

type LinkEntry = Extract<Entry, { kind: 'link' }>;

export default function LinkDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const repository = useRepository();
  const { journal, isLoading } = useJournal();
  const entry = journal?.entries.find((e): e is LinkEntry => e.kind === 'link' && e.link.id === id);
  // Deep links can arrive before (or without) the Journal's copy.
  const fallback = useQuery({
    queryKey: ['link', id],
    queryFn: () => repository.links.getById(id),
    enabled: Boolean(id) && !isLoading && !entry,
  });

  useFocusEffect(
    useCallback(() => {
      toast.setInset(insets.bottom + 16);
      return () => toast.setInset(96);
    }, [insets.bottom, toast]),
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const link = entry?.link ?? fallback.data ?? null;

  return (
    <Canvas>
      <View style={[styles.bar, { paddingTop: insets.top + 6 }]}>
        <RoundButton label="Back" onPress={back} icon={(color) => <ChevronLeft size={22} color={color} strokeWidth={2.25} />} />
        {link && (
          <RoundButton
            label="Share"
            onPress={() => void Share.share({ url: link.url, message: link.url })}
            icon={(color) => <ShareIcon size={19} color={color} strokeWidth={2} />}
          />
        )}
      </View>
      {link ? (
        <Detail link={link} entry={entry} spaces={journal?.spaces ?? []} filer={journal?.filer} onDeleted={back} bottom={insets.bottom} />
      ) : isLoading || fallback.isPending ? null : (
        <Gone onBack={back} />
      )}
    </Canvas>
  );
}

const Detail = ({
  link,
  entry,
  spaces,
  filer,
  onDeleted,
  bottom,
}: {
  link: LinkWithTag;
  entry?: LinkEntry;
  spaces: JournalSpace[];
  filer?: Filer;
  onDeleted: () => void;
  bottom: number;
}) => {
  const t = useTheme();
  const { palette } = t;
  const actions = useEntryActions();
  const [imageFailed, setImageFailed] = useState(false);
  const source = sourceOf(link);
  const host = getHostname(link.url).replace(/^www\./, '');
  const title = getLinkTitle(link);
  const filedIn = new Set(entry?.spaces.map((s) => s.id));
  const suggestion = entry && !entry.spaces.length ? filer?.suggest(entry) : undefined;
  const picture = link.preview_image_url && !imageFailed ? link.preview_image_url : null;
  const from = source.key === 'web' ? host : `${source.label} · ${host}`;

  const toggle = (space: JournalSpace) => {
    if (!entry) return;
    if (filedIn.has(space.id)) void actions.unfile(entry, space);
    else void actions.file(entry, space);
  };

  return (
    <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: bottom + 33 }]}>
      <Paper level="m" radius={t.radius.l} style={styles.hero}>
        {picture ? (
          <View style={[styles.picture, { aspectRatio: ratioFor(source.key), backgroundColor: palette.well, borderRadius: t.radius.l }]}>
            <Image
              source={picture}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={180}
              onError={() => setImageFailed(true)}
              accessibilityLabel={`Picture for ${title}`}
            />
          </View>
        ) : (
          <View style={[styles.noPicture, { backgroundColor: palette.tint, borderRadius: t.radius.l }]}>
            {link.favicon_url ? (
              <Image source={link.favicon_url} style={styles.bigFav} accessibilityIgnoresInvertColors />
            ) : null}
            <Text size="s" weight="heavy" style={{ color: palette.tintInk }} numberOfLines={1}>
              {host}
            </Text>
          </View>
        )}
      </Paper>

      <View style={styles.text}>
        <Text size="xl" weight="heavy" selectable accessibilityRole="header">
          {title}
        </Text>
        <View style={styles.meta}>
          {link.favicon_url && picture ? <Image source={link.favicon_url} style={styles.metaFav} accessibilityIgnoresInvertColors /> : null}
          <Text size="xs" weight="medium" tone="muted" numeric numberOfLines={1} style={styles.flex}>
            {from} · Saved {dateFmt.format(new Date(link.created_at))}
          </Text>
        </View>
        {link.description ? (
          <Text size="m" tone="soft" selectable>
            {link.description}
          </Text>
        ) : null}
      </View>

      <Button
        variant="primary"
        label="Open in Safari"
        icon={<Compass size={18} color={palette.onAccent} strokeWidth={2.25} />}
        onPress={() =>
          void WebBrowser.openBrowserAsync(link.url, {
            presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
            controlsColor: palette.accentText,
          })
        }
      />

      <View style={styles.section}>
        <Text size="xs" weight="heavy" tone="muted" accessibilityRole="header">
          Spaces
        </Text>
        {spaces.length === 0 ? (
          <Text size="s" tone="muted">
            No spaces yet. Make one on the web and you can file links in it here.
          </Text>
        ) : (
          <View style={styles.spaceGrid}>
            {spaces.map((space) => (
              <SpaceToggle
                key={space.id}
                space={space}
                on={filedIn.has(space.id)}
                suggested={suggestion?.space.id === space.id}
                disabled={!entry || link.id.startsWith('temp-')}
                onPress={() => toggle(space)}
              />
            ))}
          </View>
        )}
        {suggestion ? (
          <Text size="xs" tone="muted">
            {suggestion.reason}.
          </Text>
        ) : !filedIn.size && spaces.length ? (
          <Text size="xs" tone="muted">
            Unfiled is fine: it stays in the Journal and the Library.
          </Text>
        ) : null}
      </View>

      <Text size="xs" tone="faint" selectable numberOfLines={3} style={styles.url}>
        {link.url}
      </Text>

      {entry && (
        <Button
          variant="ghost"
          label="Delete link"
          icon={<Trash2 size={18} color={palette.error} strokeWidth={2} />}
          onPress={() => {
            actions.deleteEntry(entry);
            onDeleted();
          }}
        />
      )}
    </ScrollView>
  );
};

/** A space you can file into: an object; on = filled in the space's hue with a check. */
const SpaceToggle = ({
  space,
  on,
  suggested,
  disabled,
  onPress,
}: {
  space: JournalSpace;
  on: boolean;
  suggested: boolean;
  disabled: boolean;
  onPress: () => void;
}) => {
  const t = useTheme();
  const { palette } = t;
  const settle = usePressSettle();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={space.name}
      accessibilityHint={on ? 'Takes the link out of this space' : 'Files the link in this space'}
      disabled={disabled}
      onPress={onPress}
      onPressIn={settle.onPressIn}
      onPressOut={settle.onPressOut}
    >
      <Animated.View
        style={[
          styles.toggle,
          { borderRadius: t.radius.m },
          on
            ? { backgroundColor: mix(space.color, palette.paper, palette.dark ? 0.32 : 0.2), boxShadow: `${t.objectShadow}, 0 0 0 1.5px ${alpha(space.color, 0.65)}` }
            : suggested
              ? { backgroundColor: palette.paper, borderWidth: 1, borderStyle: 'dashed', borderColor: alpha(space.color, 0.8) }
              : { backgroundColor: palette.paper, boxShadow: t.objectShadow },
          settle.style,
        ]}
      >
        <View style={[styles.toggleDot, { backgroundColor: space.color }]}>
          {on ? <Check size={11} color="#ffffff" strokeWidth={3.25} /> : <Plus size={11} color="#ffffff" strokeWidth={3} />}
        </View>
        <Text size="s" weight={on ? 'heavy' : 'medium'} numberOfLines={1} style={styles.flexShrink}>
          {space.name}
          {suggested && !on ? '?' : ''}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

const RoundButton = ({ label, onPress, icon }: { label: string; onPress: () => void; icon: (color: string) => ReactNode }) => {
  const t = useTheme();
  const settle = usePressSettle();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} onPressIn={settle.onPressIn} onPressOut={settle.onPressOut} hitSlop={6}>
      <Animated.View style={[styles.round, { backgroundColor: t.palette.paper, boxShadow: t.objectShadow }, settle.style]}>
        {icon(t.palette.ink)}
      </Animated.View>
    </Pressable>
  );
};

const Gone = ({ onBack }: { onBack: () => void }) => {
  const { palette } = useTheme();
  return (
    <View style={styles.gone}>
      <Placeholder
        icon={<Link2Off size={26} color={palette.onAccent} strokeWidth={2} />}
        title="This link isn’t here anymore"
        body="It may have been deleted on another device."
      >
        <Button label="Back" onPress={onBack} />
      </Placeholder>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 8 },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 17, paddingTop: 4, gap: 17 },
  hero: { overflow: 'visible' },
  picture: { width: '100%', overflow: 'hidden', maxHeight: 440 },
  noPicture: { height: 148, alignItems: 'center', justifyContent: 'center', gap: 10 },
  bigFav: { width: 40, height: 40, borderRadius: 10 },
  text: { gap: 8 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaFav: { width: 16, height: 16, borderRadius: 4 },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  section: { gap: 10, paddingTop: 4 },
  spaceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingLeft: 10, paddingRight: 14, maxWidth: 260 },
  toggleDot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  url: { paddingHorizontal: 2 },
  gone: { flex: 1, justifyContent: 'center', paddingBottom: 80 },
});
