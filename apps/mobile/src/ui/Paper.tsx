import { View, type ViewProps } from 'react-native';
import { useTheme } from '../theme/theme';

interface Props extends ViewProps {
  level?: 's' | 'm';
  radius?: number;
}

/** Paper: a surface you read. Lit edge and soft tinted depth; it never moves. */
export const Paper = ({ level = 's', radius, style, ...rest }: Props) => {
  const t = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: t.palette.paper,
          borderRadius: radius ?? t.radius.m,
          boxShadow: t.paperShadow(level),
        },
        style,
      ]}
    />
  );
};
