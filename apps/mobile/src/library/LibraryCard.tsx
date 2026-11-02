import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { getHostname, getLinkTitle, sourceOf } from '@memex/core';
import type { LinkItem } from '../data/library';
import { pictureRatio } from '../data/library';
import { useTheme } from '../theme/theme';
import { Paper } from '../ui/Paper';
import { Text } from '../ui/Text';

/*
 * A Library card (web: stream/LinkPreviewCard and the text StreamCard): an
 * image-first print for links with a picture, a text card for the rest.
 * Paper: it never moves; pressing tints it. Tap opens link detail.
 */

export const LibraryCard = memo(function LibraryCard({ item, width, onOpen }: { item: LinkItem; width: number; onOpen: (id: string) => void }) {
  const t = useTheme();
  const { palette } = t;
  const link = item.link;
  const [failed, setFailed] = useState(false);
  const [favFailed, setFavFailed] = useState(false);
  const ratio = failed ? null : pictureRatio(link);
  const title = getLinkTitle(link);
  const source = sourceOf(link);
  const host = getHostname(link.url).replace(/^www\./, '');
  const from = source.key === 'web' ? host : source.label;

  return (
    <Pressable
      onPress={() => onOpen(link.id)}
      accessibilityRole="link"
      accessibilityLabel={`${title}, ${from}`}
      style={styles.cell}
      testID={`library-card-${link.id}`}
    >
      {({ pressed }) => (
        <Paper radius={t.radius.l} style={[styles.card, pressed && { backgroundColor: palette.dark ? palette.well : palette.tint }]}>
          {ratio !== null ? (
            <View style={[styles.picture, { height: Math.round(width * ratio), backgroundColor: palette.well, borderTopLeftRadius: t.radius.l, borderTopRightRadius: t.radius.l }]}>
              <Image
                source={link.preview_image_url}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={160}
                recyclingKey={link.id}
                onError={() => setFailed(true)}
                accessibilityIgnoresInvertColors
              />
            </View>
          ) : null}
          <View style={styles.body}>
            {ratio === null && link.favicon_url && !favFailed ? (
              <Image source={link.favicon_url} style={styles.fav} onError={() => setFavFailed(true)} accessibilityIgnoresInvertColors />
            ) : null}
            <Text size={ratio === null ? 's' : 'xs'} weight={ratio === null ? 'heavy' : 'medium'} numberOfLines={ratio === null ? 4 : 2}>
              {title}
            </Text>
            {ratio === null && link.description ? (
              <Text size="xs" tone="soft" numberOfLines={3}>
                {link.description}
              </Text>
            ) : null}
            <Text size="xxs" weight="medium" tone="muted" numberOfLines={1}>
              {from}
            </Text>
          </View>
        </Paper>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  cell: { padding: 4 },
  card: {},
  picture: { overflow: 'hidden' },
  body: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10, gap: 3 },
  fav: { width: 20, height: 20, borderRadius: 5, marginBottom: 4 },
});
