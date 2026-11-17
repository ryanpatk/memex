import { StyleSheet, Text as RNText, View, useColorScheme } from 'react-native';
import { MoldedButton } from './Molded';
import { Sheet } from './Sheet';
import { useCards } from './useCards';

/*
 * The account sheet (m07): Dark follows the system on the phone, so its
 * tile says which it is; then who's signed in and Sign out. m07's Sounds,
 * Haptics and Font tiles aren't here: the phone makes no sound, haptics
 * have no setting, and IBM Plex isn't bundled.
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
  const dark = useColorScheme() === 'dark';
  return (
    <Sheet open={open} onClose={onClose} title="Account" closeLabel="Close account">
      <View style={[styles.tile, { backgroundColor: c.colors.well }]} accessible accessibilityLabel={`Dark mode ${dark ? 'on' : 'off'}, follows the system`}>
        <RNText style={[c.type.title, { color: c.colors.ink }]}>Dark</RNText>
        <RNText style={[c.type.labelUi, { color: c.colors.muted }]}>{dark ? 'On' : 'Off'} · follows the system</RNText>
      </View>
      <RNText style={[c.type.labelUi, { color: c.colors.muted, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>
        {email}
      </RNText>
      <MoldedButton label="Sign out" onPress={onSignOut} wide />
    </Sheet>
  );
};

const styles = StyleSheet.create({
  tile: { borderRadius: 28, padding: 20, gap: 6 },
});
