import { StyleSheet, View } from 'react-native';
import { CloudOff, MessageSquareText } from 'lucide-react-native';
import { getErrorMessage } from '@memex/core';
import { useTheme } from '../theme/theme';
import { Button } from './Pressable';
import { Paper } from './Paper';
import { Placeholder } from './Placeholder';

/** Loading: quiet paper shapes in the feed's own layout, so nothing jumps when data lands. */
export const FeedSkeleton = () => {
  const { palette } = useTheme();
  const bar = (width: number | `${number}%`, height: number) => (
    <View style={{ width, height, borderRadius: 8, backgroundColor: palette.well }} />
  );
  return (
    <View style={styles.skeleton} accessibilityLabel="Loading…" accessibilityRole="progressbar">
      <View style={[styles.bubble, { backgroundColor: palette.well }]} />
      <Paper style={styles.row}>
        {bar(32, 32)}
        <View style={styles.lines}>
          {bar('70%', 12)}
          {bar('40%', 10)}
        </View>
      </Paper>
      <View style={styles.tiles}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.tile, { backgroundColor: palette.well }]} />
        ))}
      </View>
      <View style={[styles.bubble, styles.short, { backgroundColor: palette.well }]} />
    </View>
  );
};

export const FeedError = ({ error, onRetry }: { error: unknown; onRetry: () => void }) => {
  const { palette } = useTheme();
  return (
    <View style={styles.center}>
      <Placeholder
        icon={<CloudOff size={26} color={palette.onAccent} strokeWidth={2} />}
        title="Couldn’t load your Journal"
        body={getErrorMessage(error)}
      >
        <Button label="Try again" onPress={onRetry} />
      </Placeholder>
    </View>
  );
};

export const FeedEmpty = () => {
  const { palette } = useTheme();
  return (
    <View style={styles.center}>
      <Placeholder
        icon={<MessageSquareText size={26} color={palette.onAccent} strokeWidth={2} />}
        title="Nothing here yet"
        body="Jots, links, notes and tasks you capture on the web or with the extension show up here, newest at the bottom."
      />
    </View>
  );
};

const styles = StyleSheet.create({
  skeleton: { flex: 1, justifyContent: 'flex-end', gap: 12, paddingHorizontal: 17, paddingBottom: 17 },
  bubble: { width: '72%', height: 44, borderRadius: 12, borderBottomLeftRadius: 4 },
  short: { width: '46%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  lines: { flex: 1, gap: 6 },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { width: 132, height: 176, borderRadius: 12 },
  center: { flex: 1, justifyContent: 'center' },
});
