/*
 * Enough Markdown to read a note on the phone: headings, paragraphs, lists
 * (bulleted, numbered, task boxes, nested by indent), quotes, fenced code
 * and rules, with bold, italic, inline code and links inside. Notes stay
 * plain markdown; this only decides how they look. Anything it doesn't know
 * reads as a paragraph, so nothing is ever hidden. The web renders with
 * react-markdown (MarkdownText); a rich editor on the phone is ROADMAP's
 * DOM-component port, not this. Plain TS, tested.
 */

export type Span = { text: string; bold?: boolean; italic?: boolean; code?: boolean; href?: string };

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; spans: Span[] }
  | { kind: 'paragraph'; spans: Span[] }
  | { kind: 'item'; depth: number; marker: 'bullet' | 'number' | 'task'; number?: number; checked?: boolean; spans: Span[] }
  | { kind: 'quote'; spans: Span[] }
  | { kind: 'code'; text: string; lang?: string }
  | { kind: 'rule' };

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const TASK = /^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const NUMBER = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const FENCE = /^\s{0,3}(```|~~~)\s*([\w+-]*)\s*$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

/** Two spaces (or a tab) per nesting level. */
const depthOf = (indent: string) => Math.min(4, Math.floor(indent.replace(/\t/g, '  ').length / 2));

export const parseMarkdown = (source: string): Block[] => {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let quote: string[] = [];

  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', spans: parseInline(paragraph.join('\n')) });
    if (quote.length) blocks.push({ kind: 'quote', spans: parseInline(quote.join('\n')) });
    paragraph = [];
    quote = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && !new RegExp(`^\\s{0,3}${fence[1]}\\s*$`).test(lines[j])) body.push(lines[j++]);
      blocks.push({ kind: 'code', text: body.join('\n'), lang: fence[2] || undefined });
      i = j;
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', level: heading[1].length as 1, spans: parseInline(heading[2]) });
      continue;
    }
    if (RULE.test(line)) {
      flush();
      blocks.push({ kind: 'rule' });
      continue;
    }
    const task = TASK.exec(line);
    if (task) {
      flush();
      blocks.push({ kind: 'item', depth: depthOf(task[1]), marker: 'task', checked: task[2] !== ' ', spans: parseInline(task[3]) });
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      flush();
      blocks.push({ kind: 'item', depth: depthOf(bullet[1]), marker: 'bullet', spans: parseInline(bullet[2]) });
      continue;
    }
    const number = NUMBER.exec(line);
    if (number) {
      flush();
      blocks.push({ kind: 'item', depth: depthOf(number[1]), marker: 'number', number: Number(number[2]), spans: parseInline(number[3]) });
      continue;
    }
    const q = QUOTE.exec(line);
    if (q) {
      if (paragraph.length) flush();
      quote.push(q[1]);
      continue;
    }
    if (quote.length) flush();
    paragraph.push(line.trim());
  }
  flush();
  return blocks;
};

/*
 * Inline: `code` first (nothing inside it is parsed), then [links](url),
 * **bold** / __bold__, *italic* / _italic_. Unclosed markers stay as text.
 */
const INLINE = /(`+)([\s\S]*?[^`])\1(?!`)|\[([^\]\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(\*\*|__)(?=\S)([\s\S]*?\S)\5|(\*|_)(?=\S)([\s\S]*?\S)\7(?![\w*])/;

export const parseInline = (text: string, marks: Omit<Span, 'text'> = {}): Span[] => {
  const spans: Span[] = [];
  let rest = text;
  while (rest) {
    const match = INLINE.exec(rest);
    if (!match) {
      spans.push({ text: rest, ...marks });
      break;
    }
    if (match.index > 0) spans.push({ text: rest.slice(0, match.index), ...marks });
    if (match[1]) spans.push({ text: match[2].trim() ? match[2].replace(/^ (.*) $/, '$1') : match[2], ...marks, code: true });
    else if (match[3]) spans.push(...parseInline(match[3], { ...marks, href: match[4] }));
    else if (match[5]) spans.push(...parseInline(match[6], { ...marks, bold: true }));
    else spans.push(...parseInline(match[8], { ...marks, italic: true }));
    rest = rest.slice(match.index + match[0].length);
  }
  return merge(spans);
};

/** Join neighbours with the same marks (fewer nested Text nodes). */
const merge = (spans: Span[]) =>
  spans.reduce<Span[]>((out, span) => {
    const last = out[out.length - 1];
    if (last && last.bold === span.bold && last.italic === span.italic && last.code === span.code && last.href === span.href) {
      last.text += span.text;
    } else out.push({ ...span });
    return out;
  }, []);

/** Links worth opening: web and mail only. */
export const safeHref = (href: string | undefined) => (href && /^(https?:|mailto:)/i.test(href) ? href : undefined);
