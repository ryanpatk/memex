import { useState } from 'react';
import { ScrollView, Share, StyleSheet, Text as RNText, View } from 'react-native';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { ChevronLeft, MoreHorizontal, Share as ShareIcon } from 'lucide-react-native';
import { getHostname, getLinkTitle, relativeTime, sourceOf, type Entry, type Filer, type JournalSpace, type LinkWithTag } from '@memex/core';
import { showFileIn, showMenu } from '../journal/entryMenu';
import { entryLabel, useEntryActions } from '../journal/useEntryActions';
import { mix } from '../theme/palette';
import { useToast } from '../ui/Toast';
import { MoldedButton, CardsRoundButton } from './Molded';
import { AddPill, SpaceToggle, SuggestPill } from './Pills';
import { useCards } from './useCards';

/*
 * The open card (m04, d11 on the phone): the picture big at the top, the
 * spaces it's in as filled pills with “+ Space” (both open “File in”), the
 * filer's dashed guess when it's unfiled, the title, where it's from and
 * when it was saved, the description, then one primary action (Open, in the
 * in-app Safari), Share, and ••• for the rest (File in…, Delete).
 */

type LinkEntry = Extract<Entry, { kind: 'link' }>;

const ratioFor = (key: string) => (key === 'pinterest' ? 4 / 5 : key === 'youtube' ? 16 / 9 : 1.6);

export const LinkPage = ({
  link,
  entry,
  spaces,
  filer,
  onBack,
  top,
  bottom,
}: {
  link: LinkWithTag;
  /** The Journal's copy (spaces, filing); absent while only the deep-linked row has loaded. */
  entry?: LinkEntry;
  spaces: JournalSpace[];
  filer?: Filer;
  onBack: () => void;
  top: number;
  bottom: number;
}) => {
  const c = useCards();
  const actions = useEntryActions();
  const toast = useToast();
  const [imageFailed, setImageFailed] = useState(false);
  const source = sourceOf(link);
  const host = getHostname(link.url).replace(/^www\./, '');
  const title = getLinkTitle(link);
  const filed = entry?.spaces ?? [];
  const suggestion = entry && !filed.length ? filer?.suggest(entry) : undefined;
  const picture = link.preview_image_url && !imageFailed ? link.preview_image_url : null;
  const from = source.key === 'web' ? host : `${source.label} · ${host}`;
  const canFile = Boolean(entry) && !link.id.startsWith('temp-') && spaces.length > 0;
  const hue = filed[0]?.color;

  const fileIn = () => entry && showFileIn(entry, entryLabel(entry), spaces, actions);
  const open = () =>
    WebBrowser.openBrowserAsync(link.url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      controlsColor: c.colors.primaryInk,
    }).catch((e: unknown) => {
      console.warn('Opening the link failed:', e);
      toast.show('Couldn’t open the link.', { tone: 'error' });
    });
  const more = () =>
    showMenu(title, [
      ...(canFile ? [{ name: 'file', label: 'File in…', run: fileIn }] : []),
      ...(entry
        ? [
            {
              name: 'delete',
              label: 'Delete',
              destructive: true,
              run: () => {
                actions.deleteEntry(entry);
                onBack();
              },
            },
          ]
        : []),
    ]);

  return (
    <ScrollView contentContainerStyle={{ paddingTop: top + 8, paddingBottom: bottom + 40 }}>
      <View style={styles.pictureWrap}>
        {picture ? (
          <View style={[styles.picture, { aspectRatio: ratioFor(source.key), backgroundColor: c.colors.well }]}>
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
          <View style={[styles.picture, styles.noPicture, { backgroundColor: hue ? mix(hue, c.colors.paper, 0.35) : c.colors.well }]}>
            {link.favicon_url ? <Image source={link.favicon_url} style={styles.bigFav} accessibilityIgnoresInvertColors /> : null}
            <RNText style={[c.type.h2, { color: c.colors.ink }]} numberOfLines={1}>
              {host}
            </RNText>
          </View>
        )}
        <View style={styles.back}>
          <CardsRoundButton label="Back" onPress={onBack}>
            <ChevronLeft size={24} color={c.colors.ink} strokeWidth={2.75} />
          </CardsRoundButton>
        </View>
      </View>

      <View style={styles.body}>
        {spaces.length > 0 && (
          <View style={styles.pills} accessibilityLabel="Spaces">
            {filed.map((space) => (
              <SpaceToggle
                key={space.id}
                name={space.name}
                color={space.color}
                on
                onPress={fileIn}
                accessibilityLabel={`In ${space.name}. Change spaces`}
              />
            ))}
            {suggestion && <SuggestPill name={suggestion.space.name} color={suggestion.space.color} hint={suggestion.reason} onPress={() => entry && void actions.file(entry, suggestion.space)} />}
            {canFile && <AddPill label="Space" accessibilityLabel="Add to a space" onPress={fileIn} />}
          </View>
        )}
        <RNText style={[c.type.h2, { color: c.colors.ink }]} selectable accessibilityRole="header">
          {title}
        </RNText>
        <RNText style={[c.type.labelUi, { color: c.colors.muted, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>
          {from} · saved {relativeTime(link.created_at)}
        </RNText>
        {link.description ? (
          <RNText style={[c.type.body, { color: c.colors.muted }]} selectable>
            {link.description}
          </RNText>
        ) : null}
        <View style={styles.actions}>
          <View style={styles.flex}>
            <MoldedButton variant="primary" label="Open ↗" accessibilityLabel="Open in Safari" onPress={() => void open()} wide />
          </View>
          <CardsRoundButton
            size={56}
            label="Share"
            onPress={() => Share.share({ url: link.url, message: link.url }).catch((e: unknown) => console.warn('Share failed:', e))}
          >
            <ShareIcon size={22} color={c.colors.ink} strokeWidth={2.5} />
          </CardsRoundButton>
          {(entry || canFile) && (
            <CardsRoundButton size={56} label="More actions" onPress={more}>
              <MoreHorizontal size={24} color={c.colors.ink} strokeWidth={2.75} />
            </CardsRoundButton>
          )}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  pictureWrap: { marginHorizontal: 12 },
  picture: { width: '100%', maxHeight: 420, borderRadius: 32, overflow: 'hidden' },
  noPicture: { height: 200, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  bigFav: { width: 48, height: 48, borderRadius: 12 },
  back: { position: 'absolute', top: 12, left: 12 },
  body: { paddingHorizontal: 20, paddingTop: 20, gap: 12 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 },
  flex: { flex: 1 },
});
