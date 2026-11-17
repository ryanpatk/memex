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
        t.cards
          ? {
              // Memory Cards: rounder paper (rows 24, cards 28) on the look's soft elevation
              backgroundColor: t.cards.colors.paper,
              borderRadius: Math.max(radius ?? 24, 24),
              boxShadow: level === 'm' ? t.cards.cardShadow : `inset 0 2px 0 0 ${t.palette.lit}, ${t.cards.softShadow}`,
            }
          : {
              backgroundColor: t.palette.paper,
              borderRadius: radius ?? t.radius.m,
              boxShadow: t.paperShadow(level),
            },
        style,
      ]}
    />
  );
};
