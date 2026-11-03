-- Same-owner rules (migration 20261104120000_same_owner_checks.sql).
-- Two users, A and B. A tries to point A's rows at B's rows, first as the
-- app does (role `authenticated`, RLS on), then as memex-api does (role
-- `service_role`, RLS off); every attempt must be refused, and the normal
-- same-user writes must still work.
--
-- Run with scripts/test-db.sh (throwaway local Postgres, production schema
-- from a backup). Everything happens inside one transaction that is rolled
-- back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(33);

-- ── fixtures (as the table owner) ───────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@test.invalid'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'b@test.invalid');

INSERT INTO profiles (id, user_id, name) VALUES
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001', '[test] A space'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-000000000001', '[test] B space');
INSERT INTO projects (id, user_id, name) VALUES
  ('aaaaaaaa-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-000000000001', 'Library'),
  ('bbbbbbbb-0000-4000-8000-0000000000b2', 'bbbbbbbb-0000-4000-8000-000000000001', 'Library');
INSERT INTO tags (id, user_id, name, color) VALUES
  ('aaaaaaaa-0000-4000-8000-0000000000a3', 'aaaaaaaa-0000-4000-8000-000000000001', 'a', 'blue'),
  ('bbbbbbbb-0000-4000-8000-0000000000b3', 'bbbbbbbb-0000-4000-8000-000000000001', 'b', 'blue');
INSERT INTO links (id, user_id, project_id, url) VALUES
  ('aaaaaaaa-0000-4000-8000-0000000000a4', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a2', 'https://a.test'),
  ('bbbbbbbb-0000-4000-8000-0000000000b4', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000b2', 'https://b.test');
INSERT INTO notes (id, user_id, title) VALUES
  ('aaaaaaaa-0000-4000-8000-0000000000a5', 'aaaaaaaa-0000-4000-8000-000000000001', '[test] A note');
INSERT INTO tasks (id, user_id, title) VALUES
  ('aaaaaaaa-0000-4000-8000-0000000000a6', 'aaaaaaaa-0000-4000-8000-000000000001', '[test] A task');
INSERT INTO self_messages (id, user_id, body) VALUES
  ('aaaaaaaa-0000-4000-8000-0000000000a7', 'aaaaaaaa-0000-4000-8000-000000000001', '[test] A jot');
INSERT INTO agent_tokens (id, user_id, client_name, scope, token_hash) VALUES
  ('aaaaaaaa-0000-4000-8000-0000000000a8', 'aaaaaaaa-0000-4000-8000-000000000001', 'a-bot', 'read_write', repeat('a', 64)),
  ('bbbbbbbb-0000-4000-8000-0000000000b8', 'bbbbbbbb-0000-4000-8000-000000000001', 'b-bot', 'read_write', repeat('b', 64));
INSERT INTO inbox_proposals (id, user_id, token_id, client_name, kind, item_type, item_id, changes) VALUES
  ('aaaaaaaa-0000-4000-8000-0000000000a9', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a8',
   'a-bot', 'edit', 'note', 'aaaaaaaa-0000-4000-8000-0000000000a5', '{"title":"x"}');

-- ── the app, signed in as A (RLS applies) ───────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

SELECT is(auth.uid(), 'aaaaaaaa-0000-4000-8000-000000000001'::uuid, 'signed in as A');

-- The M7 gap: moving a jot into another user's space.
SELECT throws_ok(
  $$UPDATE self_messages SET profile_id = 'bbbbbbbb-0000-4000-8000-0000000000b1' WHERE id = 'aaaaaaaa-0000-4000-8000-0000000000a7'$$,
  '42501', NULL, 'app: a jot can''t be moved into another user''s space');
SELECT lives_ok(
  $$UPDATE self_messages SET profile_id = 'aaaaaaaa-0000-4000-8000-0000000000a1' WHERE id = 'aaaaaaaa-0000-4000-8000-0000000000a7'$$,
  'app: a jot moves into the owner''s own space');
SELECT is((SELECT profile_id FROM self_messages WHERE id = 'aaaaaaaa-0000-4000-8000-0000000000a7'),
  'aaaaaaaa-0000-4000-8000-0000000000a1'::uuid, 'app: the move landed');
SELECT lives_ok(
  $$UPDATE self_messages SET profile_id = NULL WHERE id = 'aaaaaaaa-0000-4000-8000-0000000000a7'$$,
  'app: a jot moves back to Home (no space)');
SELECT lives_ok(
  $$UPDATE self_messages SET body = '[test] A jot, edited' WHERE id = 'aaaaaaaa-0000-4000-8000-0000000000a7'$$,
  'app: editing a jot''s text still works');
SELECT throws_ok(
  $$INSERT INTO self_messages (user_id, profile_id, body) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000b1', 'x')$$,
  '42501', NULL, 'app: a new jot can''t be filed into another user''s space');

-- Filing items into spaces.
SELECT throws_ok(
  $$INSERT INTO profile_links (profile_id, link_id) VALUES ('bbbbbbbb-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-0000000000a4')$$,
  '42501', NULL, 'app: a link can''t be filed into another user''s space');
SELECT throws_ok(
  $$INSERT INTO profile_links (profile_id, link_id) VALUES ('aaaaaaaa-0000-4000-8000-0000000000a1', 'bbbbbbbb-0000-4000-8000-0000000000b4')$$,
  '42501', NULL, 'app: another user''s link can''t be filed into my space');
SELECT lives_ok(
  $$INSERT INTO profile_links (profile_id, link_id, is_super_favorite) VALUES ('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000a4', true)$$,
  'app: filing and pinning my link in my space works');
SELECT throws_ok(
  $$UPDATE profile_links SET profile_id = 'bbbbbbbb-0000-4000-8000-0000000000b1' WHERE link_id = 'aaaaaaaa-0000-4000-8000-0000000000a4'$$,
  '42501', NULL, 'app: a membership can''t be re-pointed at another user''s space');
SELECT throws_ok(
  $$INSERT INTO profile_notes (profile_id, note_id) VALUES ('bbbbbbbb-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-0000000000a5')$$,
  '42501', NULL, 'app: a note can''t be filed into another user''s space');
SELECT throws_ok(
  $$INSERT INTO profile_tasks (profile_id, task_id) VALUES ('bbbbbbbb-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-0000000000a6')$$,
  '42501', NULL, 'app: a task can''t be filed into another user''s space');

-- Links' legacy project and tag columns, and tag joins.
SELECT throws_ok(
  $$INSERT INTO links (user_id, project_id, url) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000b2', 'https://x.test')$$,
  '42501', NULL, 'app: a link can''t live in another user''s project');
SELECT throws_ok(
  $$UPDATE links SET tag_id = 'bbbbbbbb-0000-4000-8000-0000000000b3' WHERE id = 'aaaaaaaa-0000-4000-8000-0000000000a4'$$,
  '42501', NULL, 'app: a link can''t carry another user''s tag');
SELECT lives_ok(
  $$UPDATE links SET title = '[test] renamed', tag_id = 'aaaaaaaa-0000-4000-8000-0000000000a3' WHERE id = 'aaaaaaaa-0000-4000-8000-0000000000a4'$$,
  'app: renaming and tagging my own link works');
SELECT throws_ok(
  $$INSERT INTO link_tags (link_id, tag_id) VALUES ('aaaaaaaa-0000-4000-8000-0000000000a4', 'bbbbbbbb-0000-4000-8000-0000000000b3')$$,
  '42501', NULL, 'app: link_tags refuses another user''s tag');
SELECT lives_ok(
  $$INSERT INTO links (user_id, project_id, url) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a2', 'https://new.test')$$,
  'app: saving a link into my own project works');

-- Deciding a proposal (status only) still works.
SELECT lives_ok(
  $$UPDATE inbox_proposals SET status = 'rejected', decided_at = now() WHERE id = 'aaaaaaaa-0000-4000-8000-0000000000a9'$$,
  'app: rejecting my own pending proposal works');

-- Nothing of B's is visible to A.
SELECT is((SELECT count(*) FROM profiles WHERE user_id = 'bbbbbbbb-0000-4000-8000-000000000001'), 0::bigint, 'app: B''s spaces are invisible to A');

-- ── memex-api (service role, RLS bypassed): the triggers hold the line ──────
RESET ROLE;
SET LOCAL ROLE service_role;

SELECT throws_ok(
  $$UPDATE self_messages SET profile_id = 'bbbbbbbb-0000-4000-8000-0000000000b1' WHERE id = 'aaaaaaaa-0000-4000-8000-0000000000a7'$$,
  '42501', NULL, 'service: a jot can''t be moved into another user''s space');
SELECT throws_ok(
  $$INSERT INTO self_messages (user_id, profile_id, body) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000b1', 'x')$$,
  '42501', NULL, 'service: add_jot can''t file into another user''s space');
SELECT throws_ok(
  $$INSERT INTO profile_links (profile_id, link_id) VALUES ('bbbbbbbb-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-0000000000a4')$$,
  '42501', NULL, 'service: profile_links refuses mixed owners');
SELECT throws_ok(
  $$INSERT INTO profile_notes (profile_id, note_id) VALUES ('bbbbbbbb-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-0000000000a5')$$,
  '42501', NULL, 'service: profile_notes refuses mixed owners');
SELECT throws_ok(
  $$INSERT INTO profile_tasks (profile_id, task_id) VALUES ('bbbbbbbb-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-0000000000a6')$$,
  '42501', NULL, 'service: profile_tasks refuses mixed owners');
SELECT throws_ok(
  $$INSERT INTO note_tags (note_id, tag_id) VALUES ('aaaaaaaa-0000-4000-8000-0000000000a5', 'bbbbbbbb-0000-4000-8000-0000000000b3')$$,
  '42501', NULL, 'service: note_tags refuses mixed owners');
SELECT throws_ok(
  $$INSERT INTO task_tags (task_id, tag_id) VALUES ('aaaaaaaa-0000-4000-8000-0000000000a6', 'bbbbbbbb-0000-4000-8000-0000000000b3')$$,
  '42501', NULL, 'service: task_tags refuses mixed owners');
SELECT throws_ok(
  $$INSERT INTO links (user_id, project_id, url) VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000b2', 'https://y.test')$$,
  '42501', NULL, 'service: a capture can''t land in another user''s project');
SELECT throws_ok(
  $$INSERT INTO inbox_proposals (user_id, token_id, client_name, kind, item_type, item_id, space_id)
    VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a8', 'a-bot', 'file', 'link',
            'aaaaaaaa-0000-4000-8000-0000000000a4', 'bbbbbbbb-0000-4000-8000-0000000000b1')$$,
  '42501', NULL, 'service: a proposal can''t file into another user''s space');
SELECT throws_ok(
  $$INSERT INTO inbox_proposals (user_id, token_id, client_name, kind, item_type, item_id, changes)
    VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a8', 'a-bot', 'edit', 'link',
            'bbbbbbbb-0000-4000-8000-0000000000b4', '{"title":"x"}')$$,
  '42501', NULL, 'service: a proposal can''t target another user''s item');
SELECT throws_ok(
  $$INSERT INTO inbox_proposals (user_id, token_id, client_name, kind, item_type, item_id, changes)
    VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000b8', 'b-bot', 'edit', 'note',
            'aaaaaaaa-0000-4000-8000-0000000000a5', '{"title":"x"}')$$,
  '42501', NULL, 'service: a proposal can''t name another user''s token');
SELECT throws_ok(
  $$INSERT INTO mcp_audit_log (user_id, token_id, method, status)
    VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000b8', 'tools/call', 'ok')$$,
  '42501', NULL, 'service: an audit row can''t name another user''s token');
SELECT lives_ok(
  $$INSERT INTO profile_notes (profile_id, note_id) VALUES ('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000a5')$$,
  'service: filing a note into the same user''s space works');

SELECT * FROM finish();
ROLLBACK;
