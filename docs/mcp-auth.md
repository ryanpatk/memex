# MCP auth: bearer tokens now, OAuth later (M3-C)

How agents authenticate to memex's hosted MCP server (`docs/mcp.md`), why it's bearer tokens for now, and the OAuth design for when a client requires it. Researched 2026-11-01 against MCP spec **2026-07-28**.

## Decision (M3-A, 2026-11-01)

**Bearer agent tokens now. OAuth is M3-C, built only when a client we use needs it.** This matches ROADMAP decision 10 (token first, OAuth second) and Phase 7b.

| Client | How it authenticates to a remote MCP server | Works with memex today |
| --- | --- | --- |
| Grok via the xAI API (Remote MCP tools: native SDK, Responses API, Voice Agent API) | `authorization` field, sent as the `Authorization` header; extra `headers` allowed | **Yes** |
| Grok Build CLI | `Authorization` header from config (env var); OAuth if no header is set | **Yes** |
| Claude Code, Cursor, MCP SDK clients | Custom headers | **Yes** |
| grok.com custom connectors | Add by URL, then the server's auth flow (OAuth) | No: needs M3-C |
| claude.ai / Claude Desktop custom connectors | OAuth 2.1 with discovery | No: needs M3-C |

Why not OAuth now:

- Authorization in MCP is **optional** (spec: “Authorization is OPTIONAL for MCP implementations”). A static `Authorization: Bearer` header on every request is valid Streamable HTTP, and the Grok surfaces we need first (API, CLI) send exactly that.
- OAuth means memex runs an OAuth 2.1 **authorization server**: protected-resource metadata, authorization-server metadata, a sign-in and consent page, client registration, PKCE, codes and refresh tokens. That isn't small, and every part is security-sensitive.
- Agent tokens already give us what the M3 plan asks for: one token per client, scopes, expiry, instant revocation, a kill switch and an audit trail. OAuth tokens would land in the same table (below), so nothing built now is thrown away.

## What we have (bearer)

- `Authorization: Bearer mxa_…` (or a bare `mxa_…`, since some connectors don't say whether they add the scheme) on every request. No session, no cookie.
- `agent_tokens` holds the SHA-256, client name, scope (`read` · `read_write`), `expires_at`, `revoked_at`, `last_used_at`. Lookup is by hash; revoked and expired tokens are refused per request.
- A failed request gets `401` with `WWW-Authenticate: Bearer realm="memex"` (plus `error="invalid_token"` when a token was sent). A token whose scope doesn't cover a tool never sees that tool, and the call fails as “tool not found” (logged `denied`).
- Tokens are made with `scripts/agent-token.mjs` today. In M3-B they move to Settings → Agent tokens; the table's RLS already allows select, insert and setting `revoked_at`.

## What a Grok Bot connector needs

1. A token: `node --env-file=.env.agent-admin scripts/agent-token.mjs create --email … --name "Grok Bot: <purpose>" --scope read`.
2. In the xAI API: `{"type": "mcp", "server_url": "https://memex-api.joyfulsystems.workers.dev/mcp", "server_label": "memex", "authorization": "<token>"}`. Bearer prefix optional.
3. Nothing else: no OAuth app, no redirect URL, no client id.

## M3-C: OAuth design (when needed)

The trigger is wanting memex in grok.com or claude.ai connectors. What the 2026-07-28 spec requires of us:

**The MCP server (resource server), on memex-api:**

1. `GET /.well-known/oauth-protected-resource` (RFC 9728; servers MUST implement it), and the path-scoped variant `/.well-known/oauth-protected-resource/mcp`:
   ```json
   {
     "resource": "https://memex-api.joyfulsystems.workers.dev/mcp",
     "authorization_servers": ["https://memex-api.joyfulsystems.workers.dev"],
     "scopes_supported": ["read"],
     "bearer_methods_supported": ["header"]
   }
   ```
2. A 401 says where to look, and which scope is needed: `WWW-Authenticate: Bearer resource_metadata="https://…/.well-known/oauth-protected-resource", scope="read"`.
3. A write tool called with a read-only grant gets `403` with `error="insufficient_scope", scope="write"` (step-up), instead of today's invisible tool. With bearer tokens, keep hiding the tool.
4. Audience check: accept only tokens issued for this resource (RFC 8707 `resource`). OAuth access tokens are ours, so the check is a stored `resource` column compared to the canonical URI.

**The authorization server, also on memex-api** (one Worker, one origin):

- **Library:** `@cloudflare/workers-oauth-provider` wraps a Worker as an OAuth 2.1 provider. It implements AS metadata (RFC 8414), the authorize and token endpoints, PKCE (S256 only), refresh tokens and DCR, and stores grants hashed in KV. It needs one KV namespace (`OAUTH_KV`). Check its support for **Client ID Metadata Documents** (CIMD), which the 2026-07-28 spec prefers (DCR is deprecated but still works), and for the `iss` response parameter (RFC 9207, SHOULD now, MUST later). Add them ourselves if missing.
- **Client registration**, in the spec's priority order: CIMD (the client's `client_id` is an HTTPS URL to its metadata; we fetch it, check `redirect_uris` against an allowlist of known connector hosts such as `grok.com` and `claude.ai`, and cache it), pre-registration for clients we know, then DCR for older clients, rate-limited and with a short-lived unconfirmed state.
- **Sign-in and consent** (`/authorize`): memex-api serves a small page. The user signs in with Supabase Auth (the same GitHub OAuth or email/password as the app; v2 replaces it with passkeys), and the page shows the client's name, the requested scope (`read`, or `read` + `write`) and a token lifetime. Approving creates the grant.
- **Tokens:** access tokens become rows in the same `agent_tokens` table, with an added `oauth_client_id` and `resource` (additive migration) and a short `expires_at` (1 hour), plus a refresh token (30 days, rotated on use). The Settings list, `revoke`, `revoke-all`, the scope checks and the audit log then cover OAuth clients unchanged.
- **Security checklist** (spec → Security Considerations): exact redirect URI matching, PKCE required, state and `iss` in responses, no tokens in query strings, audience binding, short access tokens, refresh rotation, consent shown every time a new client or scope is requested, CSRF protection on the consent form, and no open redirects.

**Effort:** medium. About a day for the provider wiring, metadata, migration and a consent page, plus testing against the real grok.com and claude.ai connectors (the fiddly part: each client's discovery quirks).

## References

- MCP authorization, 2026-07-28: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
- 2026-07-28 release notes (stateless transport, DCR deprecated in favour of CIMD, RFC 9207 `iss`): https://blog.modelcontextprotocol.io/posts/2026-07-28/
- xAI Remote MCP tools (`server_url`, `server_label`, `authorization`, `headers`): https://docs.x.ai/developers/tools/remote-mcp
- RFC 9728 (protected resource metadata), RFC 8414 (AS metadata), RFC 8707 (resource indicators), RFC 9207 (issuer identification), RFC 6750 (bearer usage)
