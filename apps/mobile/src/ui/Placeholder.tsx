import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import { useCards } from '../cards/useCards';
import { mix } from '../theme/palette';

/**
 * An empty, error or “not yet” state (s08, m09): says what's going on and
 * offers the next step. An empty card slot (dashed, with its label strip and
 * a disc holding the glyph), then the title and a line.
 */
export const Placeholder = ({
  icon,
  title,
  body,
  children,
  tone = 'line',
}: {
  /** A Lucide icon element (recoloured to fit the slot) or a one-character glyph like “!”. */
  icon: ReactNode;
  title: string;
  body: string;
  children?: ReactNode;
  /** `error` tints the slot red (Couldn't load). */
  tone?: 'line' | 'error';
}) => (
  <EmptySlot icon={icon} title={title} body={body} tone={tone}>
    {children}
  </EmptySlot>
);

const EmptySlot = ({ icon, title, body, children, tone }: { icon: ReactNode; title: string; body: string; children?: ReactNode; tone: 'line' | 'error' }) => {
  const c = useCards();
  const hue = tone === 'error' ? c.colors.error : c.colors.line;
  const ink = tone === 'error' ? c.colors.error : c.colors.muted;
  const glyph = typeof icon === 'string'
    ? <RNText style={[c.type.h2, { color: ink }]}>{icon}</RNText>
    : isValidElement(icon)
    ? cloneElement(icon as ReactElement<{ color?: string; size?: number; strokeWidth?: number }>, {
        color: ink,
        size: 26,
        strokeWidth: 2.75,
      })
    : icon;
  return (
    <View style={styles.empty}>
      <View
        style={[styles.slot, { borderColor: mix(hue, c.colors.line, 0.7), backgroundColor: mix(hue, c.colors.bg, 0.08) }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={[styles.disc, { backgroundColor: c.colors.paper, boxShadow: c.softShadow }]}>{glyph}</View>
        <View style={[styles.slotStrip, { backgroundColor: mix(hue, c.colors.bg, 0.45) }]} />
      </View>
      <RNText style={[c.type.h2, styles.center, { color: c.colors.ink }]} accessibilityRole="header">
        {title}
      </RNText>
      <RNText style={[c.type.body, styles.center, { color: c.colors.muted }]}>{body}</RNText>
      {children ? <View style={styles.action}>{children}</View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  empty: { alignItems: 'center', gap: 12, paddingHorizontal: 32, paddingVertical: 24 },
  slot: { width: 220, height: 152, borderRadius: 28, borderWidth: 4, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', marginBottom: 12, overflow: 'hidden' },
  disc: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  slotStrip: { position: 'absolute', left: 8, right: 8, bottom: 8, height: 30, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  action: { marginTop: 8, alignItems: 'center' },
});
