import { StyleSheet, View, type ViewProps } from 'react-native';
import { useTheme } from '../theme/theme';

/** The page every screen sits on: Memory Cards' flat cool canvas (`--mc-bg`). */
export const Canvas = ({ style, ...rest }: ViewProps) => {
  const { palette } = useTheme();
  return <View {...rest} style={[styles.fill, { backgroundColor: palette.canvas }, style]} />;
};

const styles = StyleSheet.create({ fill: { flex: 1 } });
