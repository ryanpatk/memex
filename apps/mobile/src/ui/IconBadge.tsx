import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/theme';

/** A glossy raised disc holding an icon: the "on" object a placeholder leads with. */
export const IconBadge = ({ children, color, size = 56 }: { children: ReactNode; color?: string; size?: number }) => {
  const t = useTheme();
  const fill = color ?? t.palette.accent;
  return (
    <View
      style={[
        styles.disc,
        { width: size, height: size, borderRadius: size * 0.34, backgroundColor: fill, boxShadow: `${t.objectShadow}, ${t.glow(fill)}` },
      ]}
    >
      <LinearGradient
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderRadius: size * 0.34 }]}
        colors={['#ffffff4d', '#ffffff24', '#ffffff00', '#0000000f']}
        locations={[0, 0.46, 0.54, 1]}
      />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({ disc: { alignItems: 'center', justifyContent: 'center' } });
