import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown, safeHref } from './markdown';

describe('parseMarkdown', () => {
  it('reads headings, paragraphs and rules', () => {
    expect(parseMarkdown('## Day 1\nArashiyama at dawn,\nbamboo first.\n\n---\n\nTea.')).toEqual([
      { kind: 'heading', level: 2, spans: [{ text: 'Day 1' }] },
      { kind: 'paragraph', spans: [{ text: 'Arashiyama at dawn,\nbamboo first.' }] },
      { kind: 'rule' },
      { kind: 'paragraph', spans: [{ text: 'Tea.' }] },
    ]);
  });

  it('reads bulleted, numbered and task items with nesting', () => {
    const blocks = parseMarkdown('- tripod\n  - legs\n1. film\n- [ ] passport\n- [x] ryokan');
    expect(blocks).toEqual([
      { kind: 'item', depth: 0, marker: 'bullet', spans: [{ text: 'tripod' }] },
      { kind: 'item', depth: 1, marker: 'bullet', spans: [{ text: 'legs' }] },
      { kind: 'item', depth: 0, marker: 'number', number: 1, spans: [{ text: 'film' }] },
      { kind: 'item', depth: 0, marker: 'task', checked: false, spans: [{ text: 'passport' }] },
      { kind: 'item', depth: 0, marker: 'task', checked: true, spans: [{ text: 'ryokan' }] },
    ]);
  });

  it('keeps fenced code as it is, and quotes', () => {
    expect(parseMarkdown('> light on\n> two sides\n\n```ts\nconst a = **1**;\n```')).toEqual([
      { kind: 'quote', spans: [{ text: 'light on\ntwo sides' }] },
      { kind: 'code', text: 'const a = **1**;', lang: 'ts' },
    ]);
  });

  it('keeps an unclosed fence to the end, and empty input empty', () => {
    expect(parseMarkdown('```\nhalf')).toEqual([{ kind: 'code', text: 'half', lang: undefined }]);
    expect(parseMarkdown('')).toEqual([]);
    expect(parseMarkdown('\n\n')).toEqual([]);
  });
});

describe('parseInline', () => {
  it('reads bold, italic, code and links', () => {
    expect(parseInline('A **bold** and *soft* `code` [site](https://a.test)')).toEqual([
      { text: 'A ' },
      { text: 'bold', bold: true },
      { text: ' and ' },
      { text: 'soft', italic: true },
      { text: ' ' },
      { text: 'code', code: true },
      { text: ' ' },
      { text: 'site', href: 'https://a.test' },
    ]);
  });

  it('nests marks and leaves stray markers as text', () => {
    expect(parseInline('**very *much* so**')).toEqual([
      { text: 'very ', bold: true },
      { text: 'much', bold: true, italic: true },
      { text: ' so', bold: true },
    ]);
    expect(parseInline('2 * 3 = 6, a_b_c, **open')).toEqual([{ text: '2 * 3 = 6, a_b_c, **open' }]);
    expect(parseInline('`**not bold**`')).toEqual([{ text: '**not bold**', code: true }]);
  });
});

describe('safeHref', () => {
  it('opens web and mail links only', () => {
    expect(safeHref('https://a.test')).toBe('https://a.test');
    expect(safeHref('mailto:a@b.test')).toBe('mailto:a@b.test');
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('file:///etc')).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
  });
});
