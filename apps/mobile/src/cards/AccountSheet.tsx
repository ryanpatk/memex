import { Modal, Pressable, StyleSheet, Switch, Text as RNText, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLook } from '../theme/theme';
import { MoldedButton } from './Molded';
import { useCards } from './useCards';

/*
 * The account sheet in the Memory Cards look (m07): a bottom sheet of tiles.
 * “New look” switches back to the classic look (the choice is remembered);
 * Dark mode follows the system on the phone. Then who's signed in and Sign
 * out. Sounds, Haptics and Font switches from m07 aren't built: the phone has
 * no sound, haptics have no setting yet, and IBM Plex isn't bundled here.
 */
export const AccountSheet = ({
  open,
  onClose,
  email,
  onSignOut,
}: {
  open: boolean;
  onClose: () => void;
  email: string;
  onSignOut: () => void;
}) => {
  const c = useCards();
  const insets = useSafeAreaInsets();
  const { look, setLook } = useLook();
  const dark = useColorScheme() === 'dark';
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close account" />
      <View style={[styles.sheet, { backgroundColor: c.colors.paper, paddingBottom: insets.bottom + 24 }]} accessibilityViewIsModal>
        <View style={[styles.grab, { backgroundColor: c.colors.line }]} />
        <RNText style={[c.type.h2, { color: c.colors.ink }]} accessibilityRole="header">
          Account
        </RNText>
        <View style={styles.tiles}>
          <View style={[styles.tile, { backgroundColor: look === 'cards' ? '#5077ff' : c.colors.well, boxShadow: look === 'cards' ? c.molded() : undefined }]}>
            <View style={styles.tileTop}>
              <RNText style={[c.type.title, { color: look === 'cards' ? c.colors.onColor : c.colors.ink }]}>New look</RNText>
              <Switch
                value={look === 'cards'}
                onValueChange={(on) => setLook(on ? 'cards' : 'classic')}
                accessibilityLabel="New look"
                trackColor={{ true: c.colors.ok, false: c.colors.line }}
              />
            </View>
            <RNText style={[c.type.labelUi, { color: look === 'cards' ? c.colors.onColor : c.colors.muted, opacity: 0.8 }]}>Memory Cards</RNText>
          </View>
          <View style={[styles.tile, { backgroundColor: c.colors.well }]}>
            <RNText style={[c.type.title, { color: c.colors.ink }]}>Dark mode</RNText>
            <RNText style={[c.type.labelUi, { color: c.colors.muted }]}>{dark ? 'On · ' : 'Off · '}follows the system</RNText>
          </View>
        </View>
        <View style={[styles.row, { borderColor: c.colors.well }]}>
          <RNText style={[c.type.labelUi, { color: c.colors.muted, flex: 1 }]} numberOfLines={1}>
            {email}
          </RNText>
          <MoldedButton label="Sign out" onPress={onSignOut} />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: '#1e243466' },
  sheet: { borderTopLeftRadius: 36, borderTopRightRadius: 36, paddingHorizontal: 24, paddingTop: 16, gap: 20 },
  grab: { width: 48, height: 6, borderRadius: 3, alignSelf: 'center', marginBottom: 4 },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, borderRadius: 28, padding: 16, gap: 8, minHeight: 112, justifyContent: 'space-between' },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, borderTopWidth: 2, paddingTop: 16 },
});
