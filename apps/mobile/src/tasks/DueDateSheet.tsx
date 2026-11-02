import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { dueDayKey, fromDayKey, toDayKey } from '@memex/core';
import { useTheme } from '../theme/theme';
import { Paper } from '../ui/Paper';
import { Button } from '../ui/Pressable';
import { Text } from '../ui/Text';

/**
 * Pick a due date: the system's inline calendar on a paper sheet, with Set
 * and Cancel. Tasks store a calendar day (`YYYY-MM-DD`, core's toDayKey), so
 * no time zone shifts the day.
 */
export const DueDateSheet = ({
  title,
  due,
  onSet,
  onClose,
}: {
  /** The task's title, as the sheet's heading. */
  title: string;
  due: string | null | undefined;
  onSet: (day: string) => void;
  onClose: () => void;
}) => {
  const t = useTheme();
  const { palette } = t;
  const insets = useSafeAreaInsets();
  const [day, setDay] = useState(() => dueDayKey(due) ?? toDayKey(new Date()));
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} visible>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: palette.dark ? '#000000a0' : '#1d212759' }]} onPress={onClose} accessibilityLabel="Close" />
        <Paper level="m" radius={t.radius.l + 4} style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]} accessibilityViewIsModal>
          <Text size="xs" weight="heavy" tone="muted">
            Due date
          </Text>
          <Text size="m" weight="heavy" numberOfLines={2} accessibilityRole="header">
            {title}
          </Text>
          <DateTimePicker
            value={fromDayKey(day)}
            mode="date"
            display="inline"
            accentColor={palette.accent}
            themeVariant={palette.dark ? 'dark' : 'light'}
            onValueChange={(_event, date) => setDay(toDayKey(date))}
            testID="due-date-picker"
          />
          <View style={styles.actions}>
            <Button label="Cancel" variant="ghost" onPress={onClose} style={styles.flex} />
            <Button label="Set due date" variant="primary" onPress={() => onSet(day)} style={styles.flex} />
          </View>
        </Paper>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: { marginHorizontal: 8, padding: 17, gap: 6, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  flex: { flex: 1 },
});
