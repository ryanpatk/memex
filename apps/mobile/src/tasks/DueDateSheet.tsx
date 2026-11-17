import { useState } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { dueDayKey, fromDayKey, toDayKey } from '@memex/core';
import { MoldedButton } from '../cards/Molded';
import { Sheet } from '../cards/Sheet';
import { useTheme } from '../theme/theme';

/**
 * Pick a due date (the Due sheet's Pick a date…): the system's inline
 * calendar on a bottom sheet, with Cancel and Set. Tasks store a calendar
 * day (`YYYY-MM-DD`, core's toDayKey), so no time zone shifts the day.
 */
export const DueDateSheet = ({
  title,
  due,
  onSet,
  onClose,
}: {
  /** The task's title, under the sheet's heading. */
  title: string;
  due: string | null | undefined;
  onSet: (day: string) => void;
  onClose: () => void;
}) => {
  const { cards: c, palette } = useTheme();
  const [day, setDay] = useState(() => dueDayKey(due) ?? toDayKey(new Date()));
  return (
    <Sheet open onClose={onClose} title="Pick a date">
      <RNText style={[c.type.labelUi, { color: c.colors.muted }]} numberOfLines={2}>
        {title}
      </RNText>
      <DateTimePicker
        value={fromDayKey(day)}
        mode="date"
        display="inline"
        accentColor={c.colors.primary}
        themeVariant={palette.dark ? 'dark' : 'light'}
        onValueChange={(_event, date) => setDay(toDayKey(date))}
        testID="due-date-picker"
      />
      <View style={styles.actions}>
        <MoldedButton label="Cancel" variant="quiet" onPress={onClose} style={styles.flex} />
        <MoldedButton label="Set due date" variant="primary" onPress={() => onSet(day)} style={styles.flex} />
      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
