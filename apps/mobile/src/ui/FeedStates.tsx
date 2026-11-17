import { StyleSheet, View } from 'react-native';
import { MessageSquareText } from 'lucide-react-native';
import { getErrorMessage, isTransientError } from '@memex/core';
import { useCards } from '../cards/useCards';
import { Button } from './Pressable';
import { Placeholder } from './Placeholder';

/** Loading (m09): blank memory cards (a picture box, two bars, an empty label strip), so nothing jumps when data lands. */
export const FeedSkeleton = () => {
  const c = useCards();
  const bar = (width: `${number}%`) => <View style={[styles.bar, { width, backgroundColor: c.colors.well }]} />;
  return (
    <View style={styles.skeleton} accessibilityLabel="Loading…" accessibilityRole="progressbar">
      {[0, 1].map((i) => (
        <View key={i} style={[styles.card, { backgroundColor: c.colors.paper, boxShadow: c.cardShadow }]}>
          <View style={[styles.picture, { backgroundColor: c.colors.well, height: i ? 64 : 96 }]} />
          <View style={styles.lines}>
            {bar('70%')}
            {bar('45%')}
          </View>
          <View style={[styles.strip, { backgroundColor: c.colors.well }]} />
        </View>
      ))}
    </View>
  );
};

/** What to say when something didn't load: offline reads as offline, not as "Network request failed". */
export const errorCopy = (error: unknown, title: string): { title: string; body: string } => {
  if (isTransientError(error)) {
    const status = (error as { status?: unknown }).status;
    return typeof status === 'number'
      ? { title, body: 'memex didn’t answer just now. Try again in a moment.' }
      : { title: 'You’re offline', body: 'memex can’t reach the internet. Check your connection; this tries again when you’re back.' };
  }
  return { title, body: getErrorMessage(error) || 'Something went wrong. Try again.' };
};

/**
 * Something this screen needs didn't load (m09): the red empty slot with
 * “!”. `title` names it (“Couldn’t load your spaces”); offline says so
 * instead. `retrying` shows the button's spinner.
 */
export const FeedError = ({
  error,
  onRetry,
  title = 'Couldn’t load your Journal',
  retrying,
}: {
  error: unknown;
  onRetry: () => void;
  title?: string;
  retrying?: boolean;
}) => {
  const copy = errorCopy(error, title);
  return (
    <View style={styles.center}>
      <Placeholder icon="!" tone="error" title={copy.title} body={copy.body}>
        <Button label="Try again" loading={retrying} onPress={onRetry} />
      </Placeholder>
    </View>
  );
};

export const FeedEmpty = () => (
  <View style={styles.center}>
    <Placeholder
      icon={<MessageSquareText />}
      title="Nothing here yet"
      body="Write a jot below, paste a link, or start a line with “[] ” for a task. Everything you capture lands here, newest at the bottom."
    />
  </View>
);

const styles = StyleSheet.create({
  skeleton: { flex: 1, gap: 18, paddingHorizontal: 20, paddingTop: 10 },
  card: { borderRadius: 28, paddingTop: 12, paddingHorizontal: 12, overflow: 'hidden' },
  picture: { borderRadius: 16 },
  lines: { gap: 12, paddingHorizontal: 12, paddingTop: 16, paddingBottom: 22 },
  bar: { height: 22, borderRadius: 11 },
  strip: { height: 44, marginHorizontal: -12 },
  center: { flex: 1, justifyContent: 'center' },
});
