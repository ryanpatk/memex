import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { BookOpen } from 'lucide-react-native';
import { useJournal } from '../../data/useJournal';
import { useTheme } from '../../theme/theme';
import { Canvas } from '../../ui/Canvas';
import { Paper } from '../../ui/Paper';
import { Placeholder } from '../../ui/Placeholder';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { Text } from '../../ui/Text';

const countFmt = new Intl.NumberFormat();

/** Library placeholder: what's coming, with the real counts and the latest pictures. */
export default function LibraryScreen() {
  const t = useTheme();
  const { journal } = useJournal();
  const { width } = useWindowDimensions();
  const tileWidth = Math.floor((width - 17 * 2 - 8 * 2) / 3);
  const pictures = (journal?.entries ?? [])
    .filter((e) => e.kind === 'link' && e.link.preview_image_url)
    .slice(-6)
    .reverse();
  const stats = journal
    ? [
        { label: 'Links', value: journal.counts.link },
        { label: 'Notes', value: journal.counts.note },
        { label: 'Tasks', value: journal.counts.task },
      ]
    : [];

  return (
    <Canvas>
      <ScreenHeader title="Library" subtitle="Everything you've captured" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Placeholder
          icon={<BookOpen size={26} color={t.palette.onAccent} strokeWidth={2} />}
          title="The Library comes next"
          body="Every link, note and task as one visual grid, with type and tag filters, like the Library on the web."
        >
          {stats.length > 0 && (
            <View style={styles.stats}>
              {stats.map((s) => (
                <View key={s.label} style={[styles.stat, { backgroundColor: t.palette.well }]}>
                  <Text size="l" weight="heavy" numeric>
                    {countFmt.format(s.value)}
                  </Text>
                  <Text size="xs" weight="medium" tone="muted">
                    {s.label}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Placeholder>

        {pictures.length > 0 && (
          <View style={styles.section}>
            <Text size="xs" weight="heavy" tone="muted" style={styles.sectionHead}>
              Latest pictures
            </Text>
            <View style={styles.grid}>
              {pictures.map((e) =>
                e.kind === 'link' ? (
                  <Paper key={e.id} style={[styles.tile, { width: tileWidth, height: Math.round((tileWidth * 4) / 3) }]}>
                    <Image
                      source={e.link.preview_image_url}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      accessibilityLabel={e.link.title ?? e.link.url}
                    />
                  </Paper>
                ) : null,
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: 8, paddingBottom: 33, gap: 25 },
  stats: { flexDirection: 'row', gap: 8, alignSelf: 'stretch' },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
  section: { gap: 8, paddingHorizontal: 17 },
  sectionHead: { paddingLeft: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { overflow: 'hidden' },
});
