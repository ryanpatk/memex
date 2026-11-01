import { describe, expect, it } from 'vitest';
import { normalizeUrlKey, urlVariants } from './urlKey';

describe('normalizeUrlKey', () => {
  it('maps the forms of one page to one key', () => {
    const forms = [
      'https://example.com/a',
      'http://example.com/a',
      'https://www.example.com/a/',
      'https://EXAMPLE.com/a//',
      'https://example.com:443/a',
      'https://example.com/a#section',
      'https://example.com/a?utm_source=x&utm_medium=social',
      'https://example.com/a?fbclid=abc',
      '  https://example.com/a  ',
    ];
    for (const url of forms) expect(normalizeUrlKey(url), url).toBe('example.com/a');
  });

  it('keeps meaningful query parameters, sorted', () => {
    expect(normalizeUrlKey('https://example.com/search?q=memex&page=2&utm_campaign=z')).toBe('example.com/search?page=2&q=memex');
    expect(normalizeUrlKey('https://example.com/search?page=2&q=memex')).toBe('example.com/search?page=2&q=memex');
  });

  it('keeps paths case-sensitive and different pages apart', () => {
    expect(normalizeUrlKey('https://example.com/A')).not.toBe(normalizeUrlKey('https://example.com/a'));
    expect(normalizeUrlKey('https://example.com/a?id=1')).not.toBe(normalizeUrlKey('https://example.com/a?id=2'));
    expect(normalizeUrlKey('https://example.com:8080/a')).toBe('example.com:8080/a');
  });

  it('keeps hash routes', () => {
    expect(normalizeUrlKey('https://app.example.com/#/inbox')).toBe('app.example.com#/inbox');
    expect(normalizeUrlKey('https://app.example.com/#!/inbox')).toBe('app.example.com#!/inbox');
  });

  it('tolerates malformed escapes and rejects non-http', () => {
    expect(normalizeUrlKey('https://example.com/a?%E0%A4%A=1')).toBe('example.com/a?%E0%A4%A=1');
    expect(normalizeUrlKey('mailto:a@example.com')).toBeNull();
    expect(normalizeUrlKey('nope')).toBeNull();
  });
});

describe('urlVariants', () => {
  it('lists slash, scheme and www spellings', () => {
    const v = urlVariants('https://example.com/a');
    expect(v).toEqual(
      expect.arrayContaining([
        'https://example.com/a',
        'https://example.com/a/',
        'http://example.com/a',
        'https://www.example.com/a',
        'http://www.example.com/a/',
      ]),
    );
    expect(v.length).toBeLessThanOrEqual(9);
  });

  it('does not add a slash after a query', () => {
    const v = urlVariants('https://example.com/a?b=1');
    expect(v).toContain('https://www.example.com/a?b=1');
    expect(v.some((u) => u.endsWith('b=1/'))).toBe(false);
  });

  it('returns non-URLs as they are', () => {
    expect(urlVariants('nope')).toEqual(['nope']);
  });
});
