import { memo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { Image } from 'expo-image';
import { noteTint } from '../theme/cards';
import { useCards } from './useCards';

/*
 * The memory card on the phone (design s05, m01): a 28px card, an optional
 * 12px-inset picture with a 16px radius, a 24px rounded title and the 44px
 * label strip naming its space on the space's colour (source, kind or time
 * on the right). Jots fill with their space's colour, notes tint from it;
 * picture cards stay white so the picture leads. Pressing settles the card.
 */

export interface CardLabel {
  name: string | null;
  color: string | null;
  extra?: number;
}

export type MemoryCardKind = 'picture' | 'link' | 'note' | 'jot' | 'task';

interface Props {
  kind: MemoryCardKind;
  title: string;
  label: CardLabel;
  meta?: string;
  picture?: { uri: string; ratio: number; key: string };
  /** A link without a picture: favicon URL, else its host's first letter. */
  favicon?: { uri?: string | null; letter: string };
  excerpt?: string;
  /** The task check, left of the title. */
  leading?: ReactNode;
  /** Under the title (a due chip). */
  below?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
  /** Picture failed to load: the caller re-renders without it. */
  onPictureError?: () => void;
}

export const LabelStrip = ({ label, meta, onFill = false }: { label: CardLabel; meta?: string; onFill?: boolean }) => {
  const c = useCards();
  const unfiled = !label.name;
  const bg = onFill ? '#1d21271a' : (label.color ?? c.colors.line);
  const ink = unfiled && !onFill ? c.colors.muted : c.colors.onColor;
  return (
    <View style={[styles.strip, { height: c.size.label, backgroundColor: bg, boxShadow: onFill ? undefined : 'inset 0 2px 0 0 #ffffff66' }]}>
      <RNText style={[c.type.label, styles.stripName, { color: ink }]} numberOfLines={1}>
        {label.name ?? 'Unfiled'}
        {label.extra ? ` +${label.extra}` : ''}
      </RNText>
      {meta ? (
        <RNText style={[c.type.labelUi, styles.stripMeta, { color: ink }]} numberOfLines={1}>
          {meta}
        </RNText>
      ) : null}
    </View>
  );
};

export const MemoryCard = memo(function MemoryCard({
  kind,
  title,
  label,
  meta,
  picture,
  favicon,
  excerpt,
  leading,
  below,
  onPress,
  onLongPress,
  accessibilityLabel,
  testID,
  onPictureError,
}: Props) {
  const c = useCards();
  const [favFailed, setFavFailed] = useState(false);
  const jot = kind === 'jot';
  const note = kind === 'note';
  const bg = jot ? (label.color ?? c.colors.notePaper) : note ? noteTint(label.color, c) : c.colors.paper;
  const ink = jot ? c.colors.onColor : c.colors.ink;
  const pad = jot || kind === 'task' ? 20 : 12;
  const titleStyle = jot
    ? { ...c.type.h2, fontSize: 26, lineHeight: 31 }
    : note
      ? { ...c.type.h3, lineHeight: 30 }
      : c.type.h3;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? title}
      testID={testID}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.card,
            {
              backgroundColor: bg,
              borderRadius: c.radius.card,
              boxShadow: pressed ? c.softShadow : c.cardShadow,
              paddingTop: pad,
              paddingHorizontal: pad,
              transform: pressed ? [{ scale: 0.98 }] : undefined,
            },
          ]}
        >
          {picture ? (
            <View style={[styles.picture, { borderRadius: c.radius.picture, backgroundColor: c.colors.well, aspectRatio: 1 / picture.ratio }]}>
              <Image
                source={picture.uri}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={200}
                recyclingKey={picture.key}
                onError={onPictureError}
                accessibilityIgnoresInvertColors
              />
            </View>
          ) : null}
          {favicon && !picture ? (
            <View style={[styles.fav, { backgroundColor: c.colors.well }]}>
              {favicon.uri && !favFailed ? (
                <Image source={favicon.uri} style={styles.favImg} onError={() => setFavFailed(true)} accessibilityIgnoresInvertColors />
              ) : (
                <RNText style={[c.type.h3, { color: c.colors.muted }]}>{favicon.letter}</RNText>
              )}
            </View>
          ) : null}
          <View style={[styles.body, kind === 'task' && styles.taskBody, { paddingHorizontal: jot || kind === 'task' ? 0 : 12 }]}>
            {leading}
            <View style={styles.titleCol}>
              <RNText style={[titleStyle, { color: ink }]} numberOfLines={jot || note ? 6 : 4}>
                {title}
              </RNText>
              {excerpt ? (
                <RNText style={[c.type.labelUi, { color: c.colors.muted, fontFamily: 'Inter_500Medium' }]} numberOfLines={3}>
                  {excerpt}
                </RNText>
              ) : null}
              {below}
            </View>
          </View>
          <View style={{ marginHorizontal: -pad }}>
            <LabelStrip label={label} meta={meta} onFill={jot} />
          </View>
        </View>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  picture: { width: '100%', overflow: 'hidden' },
  fav: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 4, marginLeft: 8 },
  favImg: { width: 26, height: 26 },
  body: { paddingTop: 14, paddingBottom: 20, gap: 8 },
  taskBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingTop: 2 },
  titleCol: { flex: 1, minWidth: 0, gap: 8, alignItems: 'flex-start' },
  strip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 22 },
  stripName: { flexShrink: 1 },
  stripMeta: { opacity: 0.72, flexShrink: 1, textAlign: 'right' },
});
