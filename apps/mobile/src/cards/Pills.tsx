import { Pressable, StyleSheet, Text as RNText, View, type AccessibilityRole } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Check, Plus } from 'lucide-react-native';
import { useCards } from './useCards';

/*
 * Small space pills (s03 `.pill.xs`, 44px): a space you can pick (paper with
 * its colour dot; picked, it fills with the colour and the dot turns paper
 * with a tick), “+ Space” (a quiet outline), and the filer's dashed guess.
 * The capture sheet, the share sheet and the open card use them.
 */

export const SpaceToggle = ({
  name,
  color,
  on,
  onPress,
  accessibilityLabel,
  accessibilityRole = 'button',
  grow = false,
}: {
  name: string;
  /** No colour: a plain pill (“Journal only”). */
  color?: string;
  on: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
  /** Fill a grid cell. */
  grow?: boolean;
}) => {
  const c = useCards();
  const fill = on ? (color ?? c.colors.ink) : c.colors.paper;
  const ink = on ? (color ? c.colors.onColor : c.colors.paper) : c.colors.ink;
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityRole === 'checkbox' ? { checked: on } : { selected: on }}
      accessibilityLabel={accessibilityLabel ?? name}
      style={grow ? styles.grow : undefined}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.pill,
            {
              backgroundColor: fill,
              paddingLeft: color ? 6 : 16,
              boxShadow: on ? c.molded(pressed) : `inset 0 2px 0 0 #ffffffcc, ${c.softShadow}`,
              transform: pressed ? [{ scale: 0.96 }] : undefined,
            },
          ]}
        >
          {color ? (
            <View style={[styles.dot, { backgroundColor: on ? c.colors.paper : color, boxShadow: on ? undefined : 'inset 0 -3px 0 0 #00000024, inset 0 2px 0 0 #ffffff59' }]}>
              {on ? <Check size={16} color={c.colors.ink} strokeWidth={3.25} /> : null}
            </View>
          ) : null}
          <RNText style={[c.type.label, styles.name, { color: ink }]} numberOfLines={1}>
            {name}
          </RNText>
        </View>
      )}
    </Pressable>
  );
};

/** “+ Space”: a quiet outline pill that opens “File in”. */
export const AddPill = ({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel?: string }) => {
  const c = useCards();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}>
      {({ pressed }) => (
        <View style={[styles.pill, styles.add, { boxShadow: `inset 0 0 0 2px ${c.colors.line}`, backgroundColor: pressed ? c.colors.well : 'transparent' }]}>
          <Plus size={16} color={c.colors.muted} strokeWidth={3} />
          <RNText style={[c.type.label, { color: c.colors.muted }]}>{label}</RNText>
        </View>
      )}
    </Pressable>
  );
};

/** The filer's guess (`.strip.sug`): dashed in the space's colour; one press files it. */
export const SuggestPill = ({
  name,
  color,
  onPress,
  hint,
  accessibilityLabel,
}: {
  name: string;
  color: string;
  onPress: () => void;
  hint?: string;
  accessibilityLabel?: string;
}) => {
  const c = useCards();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? `File in ${name}`} accessibilityHint={hint}>
      {({ pressed }) => (
        <View style={[styles.pill, styles.suggest, { borderColor: color, transform: pressed ? [{ scale: 0.96 }] : undefined }]}>
          <View style={[styles.smallDot, { backgroundColor: color }]} />
          <RNText style={[c.type.label, styles.name, { color: c.colors.ink }]} numberOfLines={1}>
            File in {name}?
          </RNText>
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: 22, paddingRight: 16, maxWidth: 260 },
  grow: { flexGrow: 1 },
  dot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  smallDot: { width: 24, height: 24, borderRadius: 12 },
  name: { flexShrink: 1 },
  add: { paddingLeft: 14, gap: 6 },
  suggest: { borderWidth: 3, borderStyle: 'dashed', paddingLeft: 8 },
});
