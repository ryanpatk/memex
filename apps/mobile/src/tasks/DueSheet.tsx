import { StyleSheet, Text as RNText, View } from 'react-native';
import type { TaskWithTags } from '@memex/core';
import { MoldedButton } from '../cards/Molded';
import { Sheet } from '../cards/Sheet';
import { useCards } from '../cards/useCards';
import { dueChoices, type DueOption } from '../data/tasks';

/**
 * The Due sheet (m03): Today, Tomorrow, Next week as big buttons (the day
 * it's due already in blue), Pick a date… for the calendar, and No due date
 * when one is set. Choosing closes the sheet.
 */
export const DueSheet = ({
  task,
  now,
  onChoose,
  onClose,
}: {
  task: TaskWithTags | null;
  now?: Date;
  onChoose: (task: TaskWithTags, option: DueOption) => void;
  onClose: () => void;
}) => {
  const c = useCards();
  const choices = task ? dueChoices(task, now) : [];
  return (
    <Sheet open={Boolean(task)} onClose={onClose} title="Due" testID="due-sheet">
      {task ? (
        <RNText style={[c.type.labelUi, { color: c.colors.muted }]} numberOfLines={2}>
          {task.title}
        </RNText>
      ) : null}
      <View style={styles.grid}>
        {choices.map((choice) => (
          <View key={choice.label} style={styles.cell}>
            <MoldedButton
              label={choice.label}
              variant={choice.current ? 'primary' : choice.value === 'pick' || choice.value === null ? 'quiet' : 'secondary'}
              accessibilityLabel={choice.current ? `${choice.label}, the current due date` : choice.label}
              onPress={() => {
                if (!task) return;
                if (choice.current) return onClose();
                onChoose(task, choice);
              }}
              wide
            />
          </View>
        ))}
      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  cell: { width: '47%', flexGrow: 1 },
});
