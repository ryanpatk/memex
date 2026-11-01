import { describe, expect, it } from 'vitest';
import { SOURCES, hostOf, sourceOf } from './sources';

describe('sourceOf', () => {
  it.each([
    ['https://x.com/a/status/1', null, 'x'],
    ['https://twitter.com/a/status/1', null, 'x'],
    ['https://www.pinterest.com/pin/1', null, 'pinterest'],
    ['https://uk.pinterest.co.uk/pin/1', null, 'pinterest'],
    ['https://pin.it/abc', null, 'pinterest'],
    ['https://www.youtube.com/watch?v=1', null, 'youtube'],
    ['https://m.youtube.com/watch?v=1', null, 'youtube'],
    ['https://youtu.be/1', null, 'youtube'],
  ])('knows %s', (url, source, key) => {
    expect(sourceOf({ url, source }).key).toBe(key);
  });

  it('trusts the capture tag over the host', () => {
    expect(sourceOf({ url: 'https://i.pinimg.com/a.jpg', source: 'pinterest:save' })).toBe(SOURCES.pinterest);
    expect(sourceOf({ url: 'https://t.co/abc', source: 'x:bookmark' })).toBe(SOURCES.x);
  });

  it('treats extension captures and lookalike hosts as the web', () => {
    expect(sourceOf({ url: 'https://example.com', source: 'extension' }).key).toBe('web');
    expect(sourceOf({ url: 'https://notx.com/a', source: null }).key).toBe('web');
    expect(sourceOf({ url: 'https://youtube.com.evil.dev/a' }).key).toBe('web');
  });

  it('labels web links by host without www', () => {
    expect(sourceOf({ url: 'https://www.example.com/a' })).toEqual({ key: 'web', label: 'example.com', one: 'link', many: 'links' });
  });
});

describe('hostOf', () => {
  it('strips www and tolerates missing schemes', () => {
    expect(hostOf('https://www.example.com/a')).toBe('example.com');
    expect(hostOf('example.com/a')).toBe('example.com');
  });
});
