import { ActionSheetIOS, Alert, Platform } from 'react-native';
import type { DueOption } from '../data/tasks';

/** The due-date menu (web: the Tasks row's ··· menu); options from data/tasks.ts → dueOptions. */
export const showDueMenu = (title: string, options: DueOption[], choose: (option: DueOption) => void) => {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { title, options: [...options.map((o) => o.label), 'Cancel'], cancelButtonIndex: options.length },
      (index) => {
        const option = options[index];
        if (option) choose(option);
      },
    );
    return;
  }
  Alert.alert(title, undefined, [
    ...options.map((o) => ({ text: o.label, onPress: () => choose(o) })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
};
