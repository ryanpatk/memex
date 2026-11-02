import { Text } from 'react-native';
import { WORDMARK_INK } from '@memex/core';
import { FONTS, useTheme } from '../theme/theme';

/** The memex wordmark: Nunito Black in Joyful Systems blue (web: ui/Wordmark.tsx). */
export const Wordmark = ({ size = 30 }: { size?: number }) => {
  const { palette } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel="memex"
      style={{
        fontFamily: FONTS.wordmark,
        fontSize: size,
        lineHeight: size * 1.15,
        letterSpacing: -0.05 * size,
        color: palette.dark ? '#8fa8ff' : WORDMARK_INK,
        textShadowColor: palette.dark ? '#00000080' : '#2f55d640',
        textShadowOffset: { width: 0, height: size / 15 },
        textShadowRadius: size / 8,
      }}
    >
      memex
    </Text>
  );
};
