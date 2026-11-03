import { describe, expect, it } from 'vitest';
import { BodyTooLargeError, clientIp, overLimit, readBodyLimited } from './limits';

/** A request whose body streams in chunks with no Content-Length, like a chunked upload. */
const streamed = (chunks: string[]) => {
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled >= chunks.length) return controller.close();
      controller.enqueue(new TextEncoder().encode(chunks[pulled++]));
    },
  });
  const req = new Request('https://api.example/x', { method: 'POST', body, duplex: 'half' } as RequestInit);
  return { req, pulled: () => pulled };
};

describe('readBodyLimited', () => {
  it('returns bodies up to the cap', async () => {
    expect(await readBodyLimited(new Request('https://a.example', { method: 'POST', body: 'hello' }), 5)).toBe('hello');
    expect(await readBodyLimited(new Request('https://a.example'), 5)).toBe('');
  });

  it('refuses a declared Content-Length over the cap without reading', async () => {
    const req = new Request('https://a.example', { method: 'POST', body: 'x', headers: { 'Content-Length': '999999' } });
    await expect(readBodyLimited(req, 10)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('counts bytes, not characters', async () => {
    // 4 characters, 10 bytes in UTF-8
    const req = new Request('https://a.example', { method: 'POST', body: '日本語!' });
    await expect(readBodyLimited(req, 9)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(await readBodyLimited(new Request('https://a.example', { method: 'POST', body: '日本語!' }), 10)).toBe('日本語!');
  });

  it('stops reading a stream with no Content-Length as soon as it passes the cap', async () => {
    const { req, pulled } = streamed(['aaaa', 'bbbb', 'cccc', 'dddd', 'eeee', 'ffff']);
    await expect(readBodyLimited(req, 6)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(pulled()).toBeLessThanOrEqual(3);
  });
});

describe('rate limit helpers', () => {
  it('reads the client IP Cloudflare reports', () => {
    expect(clientIp(new Request('https://a.example', { headers: { 'CF-Connecting-IP': '203.0.113.9' } }))).toBe('203.0.113.9');
    expect(clientIp(new Request('https://a.example'))).toBe('unknown');
  });

  it('fails open when the limiter is missing or errors, and closed when it says no', async () => {
    expect(await overLimit(undefined, 'k')).toBe(false);
    expect(await overLimit({ limit: async () => Promise.reject(new Error('down')) }, 'k')).toBe(false);
    expect(await overLimit({ limit: async () => ({ success: true }) }, 'k')).toBe(false);
    expect(await overLimit({ limit: async () => ({ success: false }) }, 'k')).toBe(true);
  });
});
