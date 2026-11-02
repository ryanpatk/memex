import { Text as RNText, type TextProps } from 'react-native';
import type { TypeSize } from '@memex/core';
import { typeRole, useTheme, type Weight } from '../theme/theme';

export type Tone = 'ink' | 'soft' | 'muted' | 'faint' | 'accent' | 'error' | 'onAccent';

interface Props extends TextProps {
  size?: TypeSize;
  weight?: Weight;
  tone?: Tone;
  /** Tabular figures, for numbers that get compared. */
  numeric?: boolean;
}

/** Text on a Pastel Sky type role (size + line + tracking together). */
export const Text = ({ size = 's', weight = 'regular', tone = 'ink', numeric, style, ...rest }: Props) => {
  const { palette } = useTheme();
  const color = {
    ink: palette.ink,
    soft: palette.inkSoft,
    muted: palette.muted,
    faint: palette.faint,
    accent: palette.accentText,
    error: palette.error,
    onAccent: palette.onAccent,
  }[tone];
  return (
    <RNText
      {...rest}
      style={[typeRole(size, weight), { color }, numeric && { fontVariant: ['tabular-nums'] }, style]}
    />
  );
};
