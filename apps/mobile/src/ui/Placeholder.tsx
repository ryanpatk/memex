import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Paper } from './Paper';
import { IconBadge } from './IconBadge';
import { Text } from './Text';

/** A tab that isn't built yet: says what's coming and, where it can, shows real numbers. */
export const Placeholder = ({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  children?: ReactNode;
}) => (
  <Paper level="m" radius={19} style={styles.card}>
    <IconBadge>{icon}</IconBadge>
    <View style={styles.copy}>
      <Text size="m" weight="heavy" style={styles.center}>
        {title}
      </Text>
      <Text size="s" tone="muted" style={styles.center}>
        {body}
      </Text>
    </View>
    {children}
  </Paper>
);

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: 17, paddingHorizontal: 25, paddingVertical: 33, marginHorizontal: 17 },
  copy: { gap: 4, maxWidth: 300 },
  center: { textAlign: 'center' },
});
