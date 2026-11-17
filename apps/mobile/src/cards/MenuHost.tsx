import { Fragment, useSyncExternalStore } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text as RNText, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Check } from 'lucide-react-native';
import { menuStore, type MenuRow } from './menuStore';
import { useCards } from './useCards';

/*
 * The menu (s07, m08): a paper card over a light scrim with rounded rows.
 * “File in” rows lead with the space's dot and tick the spaces it's in;
 * Delete is red, under a rule. A row closes the menu, then runs. Mounted
 * once (app/_layout); menuStore says what's open.
 */
export const MenuHost = () => {
  const spec = useSyncExternalStore(menuStore.subscribe, menuStore.get, menuStore.get);
  const c = useCards();
  const { width, height } = useWindowDimensions();
  const close = () => menuStore.close();
  const choose = (row: MenuRow) => {
    void Haptics.selectionAsync();
    menuStore.close();
    row.run();
  };
  return (
    <Modal visible={Boolean(spec)} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.extra.scrimLight }]} onPress={close} accessibilityRole="button" accessibilityLabel="Close menu" />
        {spec && (
          <View
            style={[styles.menu, { width: Math.min(width - 48, 360), maxHeight: height * 0.7, backgroundColor: c.colors.paper, boxShadow: c.menuShadow }]}
            accessibilityViewIsModal
            onAccessibilityEscape={close}
            accessibilityLabel={spec.title}
            testID="menu"
          >
            <ScrollView bounces={false} contentContainerStyle={styles.list}>
              {spec.sections.map((section, i) => (
                <Fragment key={section.header ?? i}>
                  {i > 0 && <View style={[styles.rule, { backgroundColor: c.colors.well }]} />}
                  {section.header ? (
                    <RNText style={[c.type.label, styles.header, { color: c.colors.faint }]} accessibilityRole="header">
                      {section.header}
                    </RNText>
                  ) : null}
                  {section.items.map((row) => (
                    <Pressable
                      key={row.name}
                      onPress={() => choose(row)}
                      accessibilityRole="menuitem"
                      accessibilityLabel={row.label}
                      accessibilityState={row.checked === undefined ? undefined : { checked: row.checked }}
                      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.colors.well }]}
                    >
                      {row.dot ? <View style={[styles.dot, { backgroundColor: row.dot }]} /> : null}
                      <RNText
                        style={[c.type.title, styles.label, { fontFamily: 'Nunito_700Bold', fontSize: 19, color: row.destructive ? c.colors.error : c.colors.ink }]}
                        numberOfLines={1}
                      >
                        {row.label}
                      </RNText>
                      {row.checked ? <Check size={20} color={c.colors.primary} strokeWidth={3} /> : null}
                    </Pressable>
                  ))}
                </Fragment>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  menu: { borderRadius: 28, overflow: 'hidden' },
  list: { padding: 12 },
  header: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 56, borderRadius: 18, paddingHorizontal: 16 },
  dot: { width: 24, height: 24, borderRadius: 12 },
  label: { flex: 1, minWidth: 0 },
  rule: { height: 2, marginVertical: 8, marginHorizontal: 12 },
});
