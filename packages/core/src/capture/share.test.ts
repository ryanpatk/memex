import { describe, expect, it } from 'vitest';
import { parseSharedContent, urlsInText } from './share';

describe('parseSharedContent', () => {
  it('Safari: a URL with the page title', () => {
    expect(parseSharedContent({ url: 'https://calmtech.com/ ', text: 'https://calmtech.com/', title: '  Calm  Technology ' })).toEqual({
      kind: 'link',
      url: 'https://calmtech.com/',
      title: 'Calm Technology',
      note: null,
    });
  });

  it('X and YouTube: just the URL, as text', () => {
    expect(parseSharedContent({ text: 'https://x.com/rauchg/status/1850000000000000000?s=46' })).toEqual({
      kind: 'link',
      url: 'https://x.com/rauchg/status/1850000000000000000?s=46',
      title: null,
      note: null,
    });
    expect(parseSharedContent({ text: 'https://youtu.be/dQw4w9WgXcQ?si=abc' })).toMatchObject({ kind: 'link', url: 'https://youtu.be/dQw4w9WgXcQ?si=abc' });
  });

  it('a short line around one URL becomes the note', () => {
    expect(parseSharedContent({ text: 'Look at this: https://example.com/a.' })).toEqual({
      kind: 'link',
      url: 'https://example.com/a',
      title: null,
      note: 'Look at this',
    });
    expect(parseSharedContent({ text: '“Small tools, loved” — https://example.com' })).toMatchObject({ note: 'Small tools, loved' });
  });

  it('keeps a closing parenthesis the URL opened', () => {
    expect(urlsInText('see (https://en.wikipedia.org/wiki/Memex_(machine))')).toEqual(['https://en.wikipedia.org/wiki/Memex_(machine)']);
  });

  it('plain text, long text and several URLs stay text', () => {
    expect(parseSharedContent({ text: '  Buy matcha in Uji  ' })).toEqual({ kind: 'text', text: 'Buy matcha in Uji' });
    const long = `${'A long passage worth keeping. '.repeat(10)}https://example.com`;
    expect(parseSharedContent({ text: long })).toEqual({ kind: 'text', text: long.trim() });
    expect(parseSharedContent({ text: 'https://a.com and https://b.com' })).toEqual({ kind: 'text', text: 'https://a.com and https://b.com' });
    // a long text with its URL sent separately keeps the URL
    expect(parseSharedContent({ text: 'x'.repeat(250), url: 'https://example.com' })).toEqual({ kind: 'text', text: `${'x'.repeat(250)}\nhttps://example.com` });
  });

  it('ignores what isn’t an http(s) URL', () => {
    expect(parseSharedContent({ url: 'file:///private/var/x.pdf', text: '' })).toEqual({ kind: 'empty' });
    expect(parseSharedContent({ url: 'javascript:alert(1)', text: 'hello' })).toEqual({ kind: 'text', text: 'hello' });
    expect(parseSharedContent({})).toEqual({ kind: 'empty' });
  });
});
