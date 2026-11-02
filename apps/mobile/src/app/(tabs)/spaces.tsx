import { ScrollView, StyleSheet, View } from 'react-native';
import { Shapes } from 'lucide-react-native';
import { useJournal } from '../../data/useJournal';
import { alpha } from '../../theme/palette';
import { useTheme } from '../../theme/theme';
import { Canvas } from '../../ui/Canvas';
import { Paper } from '../../ui/Paper';
import { Placeholder } from '../../ui/Placeholder';
import { ScreenHeader } from '../../ui/ScreenHeader';
import { Text } from '../../ui/Text';

const countFmt = new Intl.NumberFormat();

/** Spaces: each space in its own hue with how much is filed there. Boards open here next. */
export default function SpacesScreen() {
  const t = useTheme();
  const { journal } = useJournal();
  const spaces = journal?.spaces ?? [];

  return (
    <Canvas>
      <ScreenHeader
        title="Spaces"
        subtitle={journal ? `${spaces.length} ${spaces.length === 1 ? 'space' : 'spaces'}` : undefined}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        {journal && spaces.length === 0 ? (
          <Placeholder
            icon={<Shapes size={26} color={t.palette.onAccent} strokeWidth={2} />}
            title="No spaces yet"
            body="Spaces are the contexts you file things into. Make one on the web and it shows up here."
          />
        ) : (
          <Paper level="s" radius={19} style={styles.list}>
            {spaces.map((space, i) => {
              const count = journal?.perSpace.get(space.id) ?? 0;
              return (
                <View
                  key={space.id}
                  style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.palette.hairline }]}
                  accessible
                  accessibilityLabel={`${space.name}, ${count} items`}
                >
                  <View
                    style={[
                      styles.swatch,
                      { backgroundColor: space.color, boxShadow: `${t.objectShadow}, 0 2px 8px -3px ${alpha(space.color, 0.7)}` },
                    ]}
                  />
                  <Text size="m" weight="medium" numberOfLines={1} style={styles.name}>
                    {space.name}
                  </Text>
                  <Text size="s" tone="muted" numeric>
                    {countFmt.format(count)}
                  </Text>
                </View>
              );
            })}
          </Paper>
        )}
        {spaces.length > 0 && (
          <Text size="xs" tone="faint" style={styles.note}>
            Space boards (the space’s Journal beside its pinned work) open here next.
          </Text>
        )}
      </ScrollView>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: 8, paddingBottom: 33, gap: 12 },
  list: { marginHorizontal: 17, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 17, minHeight: 56 },
  swatch: { width: 22, height: 22, borderRadius: 7 },
  name: { flex: 1, minWidth: 0 },
  note: { textAlign: 'center', paddingHorizontal: 33 },
});
