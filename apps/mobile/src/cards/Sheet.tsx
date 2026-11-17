import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCards } from './useCards';

/*
 * The bottom sheet (s07, s11; m03 Due, m05 Save something, m07 Account): a
 * dimmed scrim you tap to close, then paper with 36px top corners, a grab
 * handle, the title in h2 and an optional control on its right. It slides
 * up; with Reduce Motion it fades. Keyboard-aware, so a field stays in view.
 */
export const Sheet = ({
  open,
  onClose,
  title,
  right,
  children,
  closeLabel = 'Close',
  testID,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Beside the title (Cancel, a toggle group). */
  right?: ReactNode;
  children: ReactNode;
  /** The scrim's VoiceOver label. */
  closeLabel?: string;
  testID?: string;
}) => {
  const c = useCards();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  return (
    <Modal visible={open} transparent animationType={reduced ? 'fade' : 'slide'} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <Pressable style={[styles.fill, { backgroundColor: c.extra.scrim }]} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} />
        <View
          style={[styles.sheet, { backgroundColor: c.colors.paper, paddingBottom: insets.bottom + 24 }]}
          accessibilityViewIsModal
          testID={testID}
        >
          <View style={[styles.grab, { backgroundColor: c.colors.line }]} />
          <View style={styles.head}>
            <RNText style={[c.type.h2, styles.title, { color: c.colors.ink }]} accessibilityRole="header" numberOfLines={2}>
              {title}
            </RNText>
            {right}
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1 },
  sheet: { borderTopLeftRadius: 36, borderTopRightRadius: 36, paddingHorizontal: 24, paddingTop: 16, gap: 16 },
  grab: { width: 48, height: 6, borderRadius: 3, alignSelf: 'center', marginBottom: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flexShrink: 1 },
});
