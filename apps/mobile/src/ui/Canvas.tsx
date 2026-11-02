import { StyleSheet, View, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/theme';

/** The page canvas: the swatch gradient every screen sits on (web: --bookmark-experiment-bg). */
export const Canvas = ({ style, children, ...rest }: ViewProps) => {
  const { palette } = useTheme();
  return (
    <View {...rest} style={[styles.fill, { backgroundColor: palette.canvas }, style]}>
      <LinearGradient
        colors={[palette.canvasTop, palette.canvas, palette.canvas]}
        locations={[0, 0.95, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({ fill: { flex: 1 } });
