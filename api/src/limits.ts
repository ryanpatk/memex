/**
 * Request limits shared by every memex-api route (M7 hardening).
 *
 * - Body size: bodies are read through `readBodyLimited`, which counts bytes
 *   as they stream in and stops at the cap, so a request without (or lying
 *   about) Content-Length can't make the Worker buffer more than the cap.
 *   Over the cap → 413.
 * - Rate limits, two layers, both Cloudflare Workers rate limiting bindings
 *   (wrangler.jsonc → ratelimits):
 *     1. per client IP, before any token lookup (`IP_RATE_LIMITER`), so a
 *        flood of bad or guessed tokens can't turn into database load;
 *     2. per token after auth (`RATE_LIMITER` for /api/* and /agent-tokens,
 *        `MCP_RATE_LIMITER` for /mcp), so one runaway client can't use the
 *        whole IP budget of a shared network.
 *   Why the binding and not a Durable Object or KV counter: it's built in,
 *   adds no storage or per-request latency to speak of, and needs no code
 *   to expire counters. Its counts are per Cloudflare location and
 *   eventually consistent, so it's a brake on floods and runaway agents, not
 *   an exact quota; nothing in memex needs an exact quota. If the binding is
 *   missing or errors, requests are let through (fail open): the limits
 *   protect capacity, not data, and every request is still authenticated.
 */

export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** 64 KB: the largest MCP write (a 50,000-character note) fits with room to spare. */
export const MAX_BODY_BYTES = 64 * 1024;

export class BodyTooLargeError extends Error {
  constructor(readonly limit: number) {
    super(`Request body too large (limit ${Math.round(limit / 1024)} KB)`);
    this.name = 'BodyTooLargeError';
  }
}

/**
 * The request body as text, refusing more than `maxBytes` bytes (UTF-8, not
 * characters). Throws BodyTooLargeError as soon as the cap is passed; the
 * rest of the stream is cancelled, never read.
 */
export async function readBodyLimited(request: Request, maxBytes = MAX_BODY_BYTES): Promise<string> {
  const declared = Number(request.headers.get('Content-Length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError(maxBytes);
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** The caller's IP as Cloudflare saw it; one shared bucket when it's missing (local dev, tests). */
export function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Real-IP') ?? 'unknown';
}

/** True when `limiter` says this key is over its budget. Fails open. */
export async function overLimit(limiter: RateLimiter | undefined, key: string): Promise<boolean> {
  if (!limiter) return false;
  const { success } = await limiter.limit({ key }).catch(() => ({ success: true }));
  return !success;
}
