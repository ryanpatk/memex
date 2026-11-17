import { View, type ViewProps } from 'react-native';
import { useTheme } from '../theme/theme';

interface Props extends ViewProps {
  level?: 's' | 'm';
  radius?: number;
}

/** Paper: a surface you read. Rounded (rows 24, cards 28), a lit top edge and the look's soft elevation; it never moves. */
export const Paper = ({ level = 's', radius, style, ...rest }: Props) => {
  const { cards, palette } = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: cards.colors.paper,
          borderRadius: Math.max(radius ?? 24, 24),
          boxShadow: level === 'm' ? cards.cardShadow : `inset 0 2px 0 0 ${palette.lit}, ${cards.softShadow}`,
        },
        style,
      ]}
    />
  );
};
