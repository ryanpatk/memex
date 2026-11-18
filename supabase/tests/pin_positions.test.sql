-- Pin order (migration 20261118120000_add_pin_positions.sql): the two new
-- columns are nullable integers, the links triggers the backfill paused are
-- back on, and a signed-in user can place their own pins but not another
-- user's (RLS, as the app writes them).
--
-- Run with scripts/test-db.sh (throwaway local Postgres, production schema
-- from a backup). Everything happens inside one transaction that is rolled
-- back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(10);

SELECT col_type_is('public', 'links', 'pin_position', 'integer', 'links.pin_position is an integer');
SELECT col_is_null('public', 'links', 'pin_position', 'links.pin_position is nullable');
SELECT col_type_is('public', 'profile_links', 'pin_position', 'integer', 'profile_links.pin_position is an integer');
SELECT col_is_null('public', 'profile_links', 'pin_position', 'profile_links.pin_position is nullable');

SELECT is(
  (SELECT tgenabled FROM pg_trigger WHERE tgname = 'update_links_updated_at' AND tgrelid = 'public.links'::regclass),
  'O',
  'links updated_at trigger is enabled again'
);
SELECT is(
  (SELECT tgenabled FROM pg_trigger WHERE tgname = 'update_project_last_modified_on_links_change' AND tgrelid = 'public.links'::regclass),
  'O',
  'links project last_modified trigger is enabled again'
);

-- ── fixtures (as the table owner) ───────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@test.invalid'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'b@test.invalid');
INSERT INTO profiles (id, user_id, name) VALUES
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001', '[test] A space');
INSERT INTO projects (id, user_id, name) VALUES
  ('aaaaaaaa-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-000000000001', 'Library'),
  ('bbbbbbbb-0000-4000-8000-0000000000b2', 'bbbbbbbb-0000-4000-8000-000000000001', 'Library');
INSERT INTO links (id, user_id, project_id, url, is_super_favorite) VALUES
  ('aaaaaaaa-0000-4000-8000-0000000000a4', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-0000000000a2', 'https://a.test', true),
  ('bbbbbbbb-0000-4000-8000-0000000000b4', 'bbbbbbbb-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-0000000000b2', 'https://b.test', true);
INSERT INTO profile_links (profile_id, link_id, is_super_favorite) VALUES
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-0000000000a4', true);

-- ── as user A, through RLS ──────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

UPDATE links SET pin_position = 3 WHERE id = 'aaaaaaaa-0000-4000-8000-0000000000a4';
SELECT is((SELECT pin_position FROM links WHERE id = 'aaaaaaaa-0000-4000-8000-0000000000a4'), 3, 'A places a global pin');

UPDATE profile_links SET pin_position = 2 WHERE link_id = 'aaaaaaaa-0000-4000-8000-0000000000a4';
SELECT is((SELECT pin_position FROM profile_links WHERE link_id = 'aaaaaaaa-0000-4000-8000-0000000000a4'), 2, 'A places a space pin');

UPDATE links SET pin_position = 9 WHERE id = 'bbbbbbbb-0000-4000-8000-0000000000b4';
RESET ROLE;
SELECT is((SELECT pin_position FROM links WHERE id = 'bbbbbbbb-0000-4000-8000-0000000000b4'), NULL::integer, 'A can’t place B’s pin');

SELECT is(
  (SELECT count(*)::integer FROM links WHERE pin_position IS NOT NULL AND NOT is_super_favorite),
  0,
  'no unpinned link has a place'
);

SELECT * FROM finish();
ROLLBACK;
