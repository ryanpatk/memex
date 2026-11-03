import { useMemo } from 'react';
import { Linking, Platform, StyleSheet, Text as RNText, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Check } from 'lucide-react-native';
import { alpha } from '../theme/palette';
import { FONTS, useTheme } from '../theme/theme';
import { Text } from '../ui/Text';
import { useToast } from '../ui/Toast';
import { parseMarkdown, safeHref, type Block, type Span } from './markdown';

/*
 * A note, read: markdown/parseMarkdown's blocks on the Pastel Sky type
 * scale (web: MarkdownText's reading view). Web links open in the in-app
 * Safari, mailto: in Mail (the in-app browser only takes http(s)); task boxes show their state (ticking them is the editor's job).
 */

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

/** Inline runs inside a block's Text: plain RN Text, so size, line height and colour come from the block. */
const Spans = ({ spans }: { spans: Span[] }) => {
  const { palette } = useTheme();
  const toast = useToast();
  const open = (href: string) => {
    const opening = /^https?:/i.test(href) ? WebBrowser.openBrowserAsync(href, { controlsColor: palette.accentText }) : Linking.openURL(href);
    opening.catch((e: unknown) => {
      console.warn('Opening a note link failed:', e);
      toast.show('Couldn’t open that link.', { tone: 'error' });
    });
  };
  return (
    <>
      {spans.map((span, i) => {
        const href = safeHref(span.href);
        return (
          <RNText
            key={i}
            accessibilityRole={href ? 'link' : undefined}
            onPress={href ? () => open(href) : undefined}
            style={[
              span.bold && { fontFamily: FONTS.heavy },
              span.italic && { fontFamily: span.bold ? FONTS.heavyItalic : FONTS.italic },
              span.code && { fontFamily: MONO, fontSize: 14, backgroundColor: palette.well },
              span.href && { color: palette.accentText, textDecorationLine: 'underline', textDecorationColor: alpha(palette.accentText, 0.4) },
            ]}
          >
            {span.text}
          </RNText>
        );
      })}
    </>
  );
};

const BlockView = ({ block }: { block: Block }) => {
  const t = useTheme();
  const { palette } = t;
  switch (block.kind) {
    case 'heading':
      return (
        <Text
          size={block.level === 1 ? 'l' : block.level === 2 ? 'm' : 's'}
          weight="heavy"
          tone={block.level > 2 ? 'soft' : 'ink'}
          accessibilityRole="header"
          style={styles.heading}
        >
          <Spans spans={block.spans} />
        </Text>
      );
    case 'paragraph':
      return (
        <Text size="m" selectable>
          <Spans spans={block.spans} />
        </Text>
      );
    case 'item':
      return (
        <View style={[styles.item, { paddingLeft: block.depth * 18 }]}>
          {block.marker === 'task' ? (
            <View
              style={[styles.box, block.checked ? { backgroundColor: palette.success } : { boxShadow: `inset 0 0 0 1.5px ${palette.faint}` }]}
              accessible
              accessibilityRole="checkbox"
              accessibilityLabel={block.spans.map((span) => span.text).join('')}
              accessibilityState={{ checked: Boolean(block.checked) }}
            >
              {block.checked && <Check size={11} color="#ffffff" strokeWidth={3} />}
            </View>
          ) : (
            <Text size="m" tone="muted" numeric style={styles.marker}>
              {block.marker === 'number' ? `${block.number}.` : '•'}
            </Text>
          )}
          <Text size="m" selectable tone={block.checked ? 'muted' : 'ink'} style={[styles.itemText, block.checked && styles.struck]}>
            <Spans spans={block.spans} />
          </Text>
        </View>
      );
    case 'quote':
      return (
        <View style={[styles.quote, { borderLeftColor: alpha(palette.accent, 0.55) }]}>
          <Text size="m" tone="soft" selectable style={styles.italic}>
            <Spans spans={block.spans} />
          </Text>
        </View>
      );
    case 'code':
      return (
        <View style={[styles.code, { backgroundColor: palette.well, borderRadius: t.radius.m }]}>
          <Text selectable style={{ fontFamily: MONO, fontSize: 13, lineHeight: 19, color: palette.ink }}>
            {block.text}
          </Text>
        </View>
      );
    case 'rule':
      return <View style={[styles.rule, { backgroundColor: palette.hairline }]} />;
  }
};

export const MarkdownView = ({ source }: { source: string }) => {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <View style={styles.root} testID="note-body">
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { gap: 12 },
  heading: { marginTop: 8 },
  italic: { fontFamily: FONTS.italic },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: -6 },
  marker: { minWidth: 16, textAlign: 'right' },
  box: { width: 18, height: 18, borderRadius: 5, marginTop: 3, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, minWidth: 0 },
  struck: { textDecorationLine: 'line-through' },
  quote: { borderLeftWidth: 3, paddingLeft: 12 },
  code: { padding: 12 },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 6 },
});
