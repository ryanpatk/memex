import { describe, expect, it } from 'vitest';
import { isUrlLike, normalizeLooseUrl, normalizeUrlInput, noteAsUrl } from './url';

describe('normalizeUrlInput', () => {
  it('keeps URLs that have a scheme', () => {
    expect(normalizeUrlInput('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c');
  });

  it('treats any explicit http(s):// URL as a link, whatever its TLD', () => {
    expect(normalizeUrlInput('https://www.are.na/ryan/working-memory')).toBe('https://www.are.na/ryan/working-memory');
    expect(normalizeUrlInput('http://example.photography')).toBe('http://example.photography');
    expect(normalizeUrlInput(' HTTPS://Studio.Invalidtld/x ')).toBe('HTTPS://Studio.Invalidtld/x');
    expect(normalizeUrlInput('http://localhost:3000/a')).toBe('http://localhost:3000/a');
  });

  it('still needs an allowlisted TLD without a scheme', () => {
    expect(normalizeUrlInput('are.na')).toBe('');
    expect(normalizeUrlInput('www.are.na/ryan')).toBe('');
  });

  it('adds http:// to bare domains and trims', () => {
    expect(normalizeUrlInput('  example.co.uk/path ')).toBe('http://example.co.uk/path');
  });

  it('accepts a trailing dot on the host', () => {
    expect(normalizeUrlInput('example.com.')).toBe('http://example.com.');
  });

  it.each(['', '   ', 'hello', 'localhost', 'file.txt', 'two words.com', 'a..com', 'https://', 'https:// spaced.com'])('rejects %j', (value) => {
    expect(normalizeUrlInput(value)).toBe('');
    expect(isUrlLike(value)).toBe(false);
  });
});

describe('normalizeLooseUrl', () => {
  it('accepts any TLD-shaped label', () => {
    expect(normalizeLooseUrl('example.photography')).toBe('http://example.photography');
    expect(normalizeLooseUrl('xn--bcher-kva.xn--p1ai')).toBe('http://xn--bcher-kva.xn--p1ai');
  });

  it('unwraps a markdown autolink', () => {
    expect(normalizeLooseUrl('<https://example.dev/a>')).toBe('https://example.dev/a');
  });

  it('rejects non-web schemes, spaces and single labels', () => {
    expect(normalizeLooseUrl('ftp://example.com')).toBe('');
    expect(normalizeLooseUrl('a b.com')).toBe('');
    expect(normalizeLooseUrl('localhost')).toBe('');
  });
});

describe('noteAsUrl', () => {
  it('finds the URL when the note is only a URL (title and body equal or one empty)', () => {
    expect(noteAsUrl({ title: 'example.photography', body: '' })).toBe('http://example.photography');
    expect(noteAsUrl({ title: 'https://a.dev', body: ' https://a.dev ' })).toBe('https://a.dev');
  });

  it('is empty when the note holds more', () => {
    expect(noteAsUrl({ title: 'Read', body: 'https://a.dev' })).toBe('');
    expect(noteAsUrl({ title: undefined, body: '' })).toBe('');
  });
});
