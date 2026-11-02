import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/theme';
import { usePressSettle } from './Pressable';
import { Text } from './Text';

/*
 * A filter chip (web: ui/FilterChip, Toggle chips in components.css): an
 * object you press. Off: raised paper. On: the accent with gloss and its own
 * glow, the one place a toggle earns gloss. The count rides along in tabular
 * figures.
 */

const countFmt = new Intl.NumberFormat();

export const FilterChip = ({ label, count, on, onPress }: { label: string; count?: number; on: boolean; onPress: () => void }) => {
  const t = useTheme();
  const { palette } = t;
  const settle = usePressSettle();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={count === undefined ? label : `${label}, ${countFmt.format(count)}`}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      onPressIn={settle.onPressIn}
      onPressOut={settle.onPressOut}
      hitSlop={{ top: 6, bottom: 6 }}
    >
      <Animated.View
        style={[
          styles.chip,
          {
            backgroundColor: on ? palette.accent : palette.paper,
            boxShadow: on ? `${t.objectShadow}, ${t.glow(palette.accent)}` : t.objectShadow,
          },
          settle.style,
        ]}
      >
        {on && (
          <LinearGradient
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.round]}
            colors={['#ffffff4d', '#ffffff1f', '#ffffff00', '#0000000f']}
            locations={[0, 0.46, 0.54, 1]}
          />
        )}
        <Text size="xs" weight="heavy" tone={on ? 'onAccent' : 'ink'}>
          {label}
        </Text>
        {count !== undefined && (
          <Text size="xs" weight="medium" numeric tone={on ? 'onAccent' : 'muted'} style={on && styles.countOn}>
            {countFmt.format(count)}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: 13, borderRadius: 9999 },
  round: { borderRadius: 9999 },
  countOn: { opacity: 0.85 },
});
