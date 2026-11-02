-- MCP write tools (ROADMAP Phase 7d, M3-B; docs/mcp.md). Additive only: new
-- nullable columns, CHECKs every existing row already passes (the new
-- columns are NULL on them), two new tables, indexes and policies. Nothing
-- existing is dropped, renamed or rewritten.
--
-- 1. Provenance on notes, tasks and jots, like links.captured_by /
--    captured_client (20261101120000). memex-api's MCP write tools set
--    captured_by = 'agent' and captured_client = the agent token's client
--    name; the app leaves both NULL (= written in the app). The Journal shows
--    "via <client>" for agent rows, and append_to_note only appends directly
--    to a note the same client created. In the vault these become
--    `capturedBy` / `capturedClient` frontmatter, as on links.
ALTER TABLE notes ADD COLUMN IF NOT EXISTS captured_by TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS captured_client TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS captured_by TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS captured_client TEXT;
ALTER TABLE self_messages ADD COLUMN IF NOT EXISTS captured_by TEXT;
ALTER TABLE self_messages ADD COLUMN IF NOT EXISTS captured_client TEXT;

ALTER TABLE notes ADD CONSTRAINT notes_captured_by_check
  CHECK (captured_by IS NULL OR captured_by IN ('app', 'extension', 'resync', 'share', 'api', 'agent'));
ALTER TABLE notes ADD CONSTRAINT notes_captured_client_check
  CHECK (captured_client IS NULL OR char_length(captured_client) <= 80);
ALTER TABLE tasks ADD CONSTRAINT tasks_captured_by_check
  CHECK (captured_by IS NULL OR captured_by IN ('app', 'extension', 'resync', 'share', 'api', 'agent'));
ALTER TABLE tasks ADD CONSTRAINT tasks_captured_client_check
  CHECK (captured_client IS NULL OR char_length(captured_client) <= 80);
ALTER TABLE self_messages ADD CONSTRAINT self_messages_captured_by_check
  CHECK (captured_by IS NULL OR captured_by IN ('app', 'extension', 'resync', 'share', 'api', 'agent'));
ALTER TABLE self_messages ADD CONSTRAINT self_messages_captured_client_check
  CHECK (captured_client IS NULL OR char_length(captured_client) <= 80);

-- 2. The audit row of a write names what it wrote ("note:<id>",
--    "proposal:<id>"): ids only, never content.
ALTER TABLE mcp_audit_log ADD COLUMN IF NOT EXISTS result_ref TEXT;
ALTER TABLE mcp_audit_log ADD CONSTRAINT mcp_audit_log_result_ref_check
  CHECK (result_ref IS NULL OR char_length(result_ref) <= 120);

-- 3. agent_write_keys: idempotency keys for write tools, so an agent that
--    retries a call (timeout, dropped connection) doesn't write twice. The
--    first call claims (user, client, key) with result NULL, then stores the
--    small result (ids only); a repeat with the same arguments gets that
--    result back, and a repeat with different arguments is refused.
--    `fingerprint` is a hash of the arguments, never the arguments. Written
--    only by memex-api (service role); operational, not vault content.
CREATE TABLE IF NOT EXISTS agent_write_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  client_name TEXT NOT NULL CHECK (char_length(client_name) BETWEEN 1 AND 80),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  tool TEXT NOT NULL CHECK (char_length(tool) BETWEEN 1 AND 64),
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{16,64}$'),
  result JSONB CHECK (result IS NULL OR octet_length(result::text) <= 4000),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_write_keys_user_client_key
  ON agent_write_keys (user_id, client_name, idempotency_key);

ALTER TABLE agent_write_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own agent write keys" ON agent_write_keys;
CREATE POLICY "Users can view their own agent write keys" ON agent_write_keys
  FOR SELECT USING (auth.uid() = user_id);

-- 4. inbox_proposals: an agent's request to change something that already
--    exists (file it into a space, edit it, append to a note it didn't
--    write). Agents never change existing items directly; the app shows each
--    proposal in the Inbox and the user approves (the app applies the change
--    through its normal code, status 'applied') or rejects it (status
--    'rejected'; the row stays). Written by memex-api (service role); the app
--    may only move a pending proposal to applied or rejected.
--
--    kind 'file':   space_id is the space to file item into.
--    kind 'edit':   changes = { title?, text?, due_date?, done? } (text is the
--                   note body, task detail or link description).
--    kind 'append': changes = { text } to add at the end of a note.
--    item_id isn't a foreign key (it points at links, notes or tasks); the
--    app treats a missing item as "no longer exists" and offers Reject only.
--    Pending proposals are workflow state, not content: once applied, the
--    change lives in the item (and so in the vault).
CREATE TABLE IF NOT EXISTS inbox_proposals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  token_id UUID REFERENCES agent_tokens(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL CHECK (char_length(client_name) BETWEEN 1 AND 80),
  kind TEXT NOT NULL CHECK (kind IN ('file', 'edit', 'append')),
  item_type TEXT NOT NULL CHECK (item_type IN ('link', 'note', 'task')),
  item_id UUID NOT NULL,
  space_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  changes JSONB DEFAULT '{}'::jsonb NOT NULL CHECK (octet_length(changes::text) <= 120000),
  reason TEXT CHECK (reason IS NULL OR char_length(reason) <= 500),
  -- The item's updated_at when the agent proposed this, so the app can say
  -- the item changed since.
  base_updated_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected')),
  decided_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  CHECK ((kind = 'file') = (space_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_inbox_proposals_user_status_created
  ON inbox_proposals (user_id, status, created_at);

ALTER TABLE inbox_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own inbox proposals" ON inbox_proposals;
CREATE POLICY "Users can view their own inbox proposals" ON inbox_proposals
  FOR SELECT USING (auth.uid() = user_id);

-- Decide only: a pending proposal may become applied or rejected, once.
-- No INSERT or DELETE for the app; rejected rows stay as a record.
DROP POLICY IF EXISTS "Users can decide their own pending proposals" ON inbox_proposals;
CREATE POLICY "Users can decide their own pending proposals" ON inbox_proposals
  FOR UPDATE USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status IN ('applied', 'rejected'));
REVOKE INSERT, UPDATE, DELETE ON inbox_proposals FROM anon, authenticated;
GRANT UPDATE (status, decided_at) ON inbox_proposals TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON agent_write_keys FROM anon, authenticated;
