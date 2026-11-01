/**
 * memex-api — capture API for the browser extension (and any future client).
 *
 * Auth: personal access token (created in memex Settings) via
 * `Authorization: Bearer mx_…`. Only the SHA-256 hash is stored server-side.
 *
 * Routes:
 *   POST   /api/capture      { url, title?, description?, image?, favicon?, note?,
 *                               source?, spaceId?, tagIds? } → created (201) or
 *                               existing (200, duplicate: true) link
 *   DELETE /api/links/:id    undo a capture
 *   GET    /api/lookup?url=  { found: false } or { found: true, link } — the
 *                               saved link that is the same thing as `url`
 *                               (read-only; same matching as capture)
 *   GET    /api/spaces       [{ id, name }]
 *   GET    /api/tags         [{ id, name }]
 *
 * Talks to Supabase (PostgREST) with a service-role key today; when the
 * database moves, only this worker changes — clients keep the same contract.
 */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  SCRAPER_URL: string;
}

const DEFAULT_PROJECT_NAME = 'Library';

// Token-gated API: CORS stays wide open so the extension (and future clients)
// can call from any origin without preregistration.
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function error(message: string, status: number): Response {
  return json({ success: false, error: message }, status);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Minimal PostgREST client bound to the service role. */
function db(env: Env) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  return {
    async select<T>(path: string): Promise<T> {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { headers });
      if (!res.ok) throw new Error(`db select failed (${res.status})`);
      return res.json() as Promise<T>;
    },
    async insert<T>(table: string, rows: unknown): Promise<T> {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify(rows),
      });
      if (!res.ok) throw new Error(`db insert into ${table} failed (${res.status})`);
      return res.json() as Promise<T>;
    },
    async patch(path: string, body: unknown): Promise<void> {
      await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      });
    },
    async delete(path: string): Promise<Response> {
      return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { method: 'DELETE', headers });
    },
  };
}

interface TokenRow {
  id: string;
  user_id: string;
}

async function authenticate(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<TokenRow | null> {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  const hash = await sha256Hex(token);
  const rows = await db(env).select<TokenRow[]>(
    `api_tokens?token_hash=eq.${hash}&select=id,user_id&limit=1`,
  );
  const row = rows[0];
  if (!row) return null;

  ctx.waitUntil(
    db(env).patch(`api_tokens?id=eq.${row.id}`, {
      last_used_at: new Date().toISOString(),
    }),
  );
  return row;
}

interface CaptureBody {
  url?: string;
  title?: string;
  /** Page metadata the client already has (e.g. read from a logged-in X page
   *  the scraper can't see). Wins over scraped values. */
  description?: string;
  image?: string;
  favicon?: string;
  /** "Why I saved this" — stored as the description until links.note exists. */
  note?: string;
  /** Capture origin, e.g. 'extension', 'x:bookmark', 'pinterest:save'. */
  source?: string;
  spaceId?: string;
  tagIds?: string[];
}

const SOURCE_RE = /^[a-z0-9:_-]{1,40}$/;

const httpUrl = (value: string | undefined): string | null => {
  const v = value?.trim();
  return v && /^https?:\/\/\S+$/i.test(v) ? v : null;
};

/**
 * PostgREST filter matching links that are "the same thing" as `url`:
 * the exact URL ± trailing slash, and for X posts / Pinterest pins any URL
 * carrying the same id (x.com/<handle>/status/1 ≡ twitter.com/i/web/status/1).
 */
function sameLinkFilter(url: string): string {
  // `…/status/<id>` followed by end, `/` or `?` — never a longer id.
  const idPath = (segment: string, id: string) => {
    const path = encodeURIComponent(`/${segment}/${id}`);
    return `or=(url.like.*${path},url.like.*${path}%2F*,url.like.*${path}%3F*)`;
  };
  const status = url.match(/^https?:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/.*\/status\/(\d+)/i);
  if (status) return idPath('status', status[1]);
  const pin = url.match(/^https?:\/\/(?:[a-z]+\.)?pinterest\.[a-z.]+\/pin\/(\d+)/i);
  if (pin) return idPath('pin', pin[1]);

  const bare = url.replace(/\/+$/, '');
  const quoted = [bare, `${bare}/`].map((u) => `"${u.replace(/["\\]/g, '\\$&')}"`);
  return `url=in.(${encodeURIComponent(quoted.join(','))})`;
}

interface ScrapedData {
  title?: string;
  description?: string;
  image?: string;
  logo?: string;
}

async function tryScrape(env: Env, url: string): Promise<ScrapedData> {
  if (!env.SCRAPER_URL) return {};
  try {
    const res = await fetch(
      `${env.SCRAPER_URL.replace(/\/$/, '')}/api/scrape?url=${encodeURIComponent(url)}`,
      { signal: AbortSignal.timeout(9000) },
    );
    const body = (await res.json()) as { success: boolean; data?: ScrapedData };
    return body.success && body.data ? body.data : {};
  } catch {
    return {};
  }
}

async function getDefaultProjectId(env: Env, userId: string): Promise<string> {
  const client = db(env);
  const existing = await client.select<{ id: string }[]>(
    `projects?user_id=eq.${userId}&name=eq.${DEFAULT_PROJECT_NAME}&select=id&limit=1`,
  );
  if (existing[0]) return existing[0].id;

  const created = await client.insert<{ id: string }[]>('projects', {
    user_id: userId,
    name: DEFAULT_PROJECT_NAME,
    description: 'Default link library (hidden)',
    is_starred: false,
  });
  return created[0].id;
}

async function handleCapture(request: Request, env: Env, userId: string): Promise<Response> {
  let body: CaptureBody;
  try {
    body = (await request.json()) as CaptureBody;
  } catch {
    return error('Invalid JSON body', 400);
  }

  const rawUrl = httpUrl(body.url);
  if (!rawUrl) {
    return error('A valid http(s) url is required', 400);
  }

  const client = db(env);

  // Already saved → hand back the existing link instead of a duplicate.
  const existing = await client.select<Record<string, unknown>[]>(
    `links?user_id=eq.${userId}&${sameLinkFilter(rawUrl)}&select=*&order=created_at.asc&limit=1`,
  );
  if (existing[0]) {
    return json({ success: true, data: { link: existing[0], duplicate: true, attached: [] } });
  }

  const clientTitle = body.title?.trim() || null;
  const clientDescription = body.note?.trim() || body.description?.trim() || null;
  const clientImage = httpUrl(body.image);
  // Only call the scraper when the client left gaps to fill.
  const needsScrape = !clientTitle || !clientDescription || !clientImage;
  const [projectId, scraped] = await Promise.all([
    getDefaultProjectId(env, userId),
    needsScrape ? tryScrape(env, rawUrl) : Promise.resolve<ScrapedData>({}),
  ]);
  const source = body.source && SOURCE_RE.test(body.source) ? body.source : 'extension';

  // New captures go to the top of the stack, matching the app.
  const topLink = await client.select<{ order_index: number }[]>(
    `links?project_id=eq.${projectId}&select=order_index&order=order_index.asc&limit=1`,
  );
  const minOrder = topLink[0]?.order_index ?? 1;

  const inserted = await client.insert<Record<string, unknown>[]>('links', {
    user_id: userId,
    project_id: projectId,
    url: rawUrl,
    title: clientTitle || scraped.title || null,
    description: clientDescription || scraped.description || null,
    favicon_url: scraped.logo || httpUrl(body.favicon) || null,
    preview_image_url: clientImage || scraped.image || null,
    order_index: minOrder - 1,
    source,
  });
  const link = inserted[0];
  const linkId = link.id as string;

  // Optional space / tag attachment. The service role bypasses RLS, so
  // ownership is verified explicitly before writing joins.
  const attachments: string[] = [];
  if (body.spaceId) {
    const owned = await client.select<{ id: string }[]>(
      `profiles?id=eq.${body.spaceId}&user_id=eq.${userId}&select=id&limit=1`,
    );
    if (owned[0]) {
      await client.insert('profile_links', { profile_id: body.spaceId, link_id: linkId });
      attachments.push('space');
    }
  }
  if (body.tagIds?.length) {
    const owned = await client.select<{ id: string }[]>(
      `tags?id=in.(${body.tagIds.join(',')})&user_id=eq.${userId}&select=id`,
    );
    if (owned.length) {
      await client.insert(
        'link_tags',
        owned.map((tag) => ({ link_id: linkId, tag_id: tag.id })),
      );
      attachments.push(`${owned.length} tag(s)`);
    }
  }

  return json({ success: true, data: { link, duplicate: false, attached: attachments } }, 201);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const { pathname, searchParams } = new URL(request.url);

    let auth: TokenRow | null;
    try {
      auth = await authenticate(request, env, ctx);
    } catch {
      return error('Auth backend unavailable', 502);
    }
    if (!auth) return error('Missing or invalid token', 401);
    const userId = auth.user_id;

    try {
      if (request.method === 'POST' && pathname === '/api/capture') {
        return await handleCapture(request, env, userId);
      }

      const linkMatch = pathname.match(/^\/api\/links\/([0-9a-f-]{36})$/);
      if (request.method === 'DELETE' && linkMatch) {
        const res = await db(env).delete(`links?id=eq.${linkMatch[1]}&user_id=eq.${userId}`);
        return res.ok ? json({ success: true }) : error('Delete failed', 502);
      }

      if (request.method === 'GET' && pathname === '/api/lookup') {
        const url = httpUrl(searchParams.get('url') ?? undefined);
        if (!url) return error('A valid http(s) url is required', 400);
        const rows = await db(env).select<Record<string, unknown>[]>(
          `links?user_id=eq.${userId}&${sameLinkFilter(url)}` +
            '&select=id,url,title,source,created_at&order=created_at.asc&limit=1',
        );
        return json({ success: true, data: rows[0] ? { found: true, link: rows[0] } : { found: false } });
      }

      if (request.method === 'GET' && pathname === '/api/spaces') {
        const spaces = await db(env).select(
          `profiles?user_id=eq.${userId}&select=id,name&order=name.asc`,
        );
        return json({ success: true, data: spaces });
      }

      if (request.method === 'GET' && pathname === '/api/tags') {
        const tags = await db(env).select(
          `tags?user_id=eq.${userId}&select=id,name&order=name.asc`,
        );
        return json({ success: true, data: tags });
      }

      return error('Not found', 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal error';
      return error(message, 502);
    }
  },
};
