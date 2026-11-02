-- Hosted MCP on memex-api (ROADMAP Phase 7a, docs/mcp.md): per-client agent
-- tokens and an audit log of every MCP call. Additive: two new tables only;
-- api_tokens (the extension's tokens) is untouched and keeps working.
--
-- agent_tokens: one row per MCP client. Only the SHA-256 (hex) of the token
-- is stored; the plaintext (`mxa_…`) is shown once at creation. Revocation
-- sets revoked_at (rows stay so the audit log keeps its link); memex-api
-- refuses a revoked or expired token on its next request. Tokens, like
-- api_tokens, are credentials, not content, so they have no place in the
-- vault (docs/vault-format.md).
CREATE TABLE IF NOT EXISTS agent_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  client_name TEXT NOT NULL CHECK (char_length(client_name) BETWEEN 1 AND 80),
  scope TEXT NOT NULL DEFAULT 'read' CHECK (scope IN ('read', 'read_write')),
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_agent_tokens_user_id ON agent_tokens(user_id);

ALTER TABLE agent_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own agent tokens" ON agent_tokens;
CREATE POLICY "Users can view their own agent tokens" ON agent_tokens
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own agent tokens" ON agent_tokens;
CREATE POLICY "Users can insert their own agent tokens" ON agent_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id AND revoked_at IS NULL);

-- Revoke only: the app may set revoked_at (never clear it) and nothing else.
-- No DELETE policy: revoked rows stay for the audit trail.
DROP POLICY IF EXISTS "Users can revoke their own agent tokens" ON agent_tokens;
CREATE POLICY "Users can revoke their own agent tokens" ON agent_tokens
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id AND revoked_at IS NOT NULL);
REVOKE UPDATE ON agent_tokens FROM anon, authenticated;
GRANT UPDATE (revoked_at) ON agent_tokens TO authenticated;

-- mcp_audit_log: one row per MCP message from an authenticated token
-- (initialize, tools/list, every tools/call, refusals; rate-limited requests
-- at most once a minute per token). args_summary keeps
-- ids, enums, dates and numbers; free text is reduced to its length
-- (@memex/core/agent summarizeArgs), so no content or secrets land here.
-- Written by memex-api with the service role; readable by its owner.
CREATE TABLE IF NOT EXISTS mcp_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  token_id UUID REFERENCES agent_tokens(id) ON DELETE SET NULL,
  client_name TEXT,
  method TEXT NOT NULL CHECK (char_length(method) <= 100),
  tool TEXT CHECK (char_length(tool) <= 100),
  args_summary JSONB DEFAULT '{}'::jsonb NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error', 'denied', 'invalid', 'rate_limited')),
  error TEXT CHECK (char_length(error) <= 300),
  result_count INTEGER,
  duration_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mcp_audit_log_user_created ON mcp_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_log_token_created ON mcp_audit_log(token_id, created_at DESC);

ALTER TABLE mcp_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own MCP audit log" ON mcp_audit_log;
CREATE POLICY "Users can view their own MCP audit log" ON mcp_audit_log
  FOR SELECT USING (auth.uid() = user_id);
