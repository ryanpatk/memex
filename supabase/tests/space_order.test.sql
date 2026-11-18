-- Space order and hiding (migration 20261119120000_add_space_order.sql):
-- profiles.position is a nullable integer, profiles.hidden a boolean that
-- defaults to false, the updated_at trigger the backfill paused is back on,
-- and a signed-in user can order and hide their own spaces but not another
-- user's (RLS, as the app writes them).
--
-- Run with scripts/test-db.sh (throwaway local Postgres, production schema
-- from a backup). Everything happens inside one transaction that is rolled
-- back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(10);

SELECT col_type_is('public', 'profiles', 'position', 'integer', 'profiles.position is an integer');
SELECT col_is_null('public', 'profiles', 'position', 'profiles.position is nullable');
SELECT col_type_is('public', 'profiles', 'hidden', 'boolean', 'profiles.hidden is a boolean');
SELECT col_not_null('public', 'profiles', 'hidden', 'profiles.hidden is not null');
SELECT col_default_is('public', 'profiles', 'hidden', 'false', 'profiles.hidden defaults to false');
SELECT is(
  (SELECT tgenabled FROM pg_trigger WHERE tgname = 'update_profiles_updated_at' AND tgrelid = 'public.profiles'::regclass),
  'O',
  'profiles updated_at trigger is enabled again'
);

-- ── fixtures (as the table owner) ───────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@test.invalid'),
  ('bbbbbbbb-0000-4000-8000-000000000001', 'b@test.invalid');
INSERT INTO profiles (id, user_id, name) VALUES
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001', '[test] A space'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-000000000001', '[test] B space');

SELECT is((SELECT hidden FROM profiles WHERE id = 'aaaaaaaa-0000-4000-8000-0000000000a1'), false, 'a new space is not hidden');

-- ── as user A, through RLS ──────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

UPDATE profiles SET position = 4, hidden = true WHERE id = 'aaaaaaaa-0000-4000-8000-0000000000a1';
SELECT is((SELECT position FROM profiles WHERE id = 'aaaaaaaa-0000-4000-8000-0000000000a1'), 4, 'A orders their space');
SELECT is((SELECT hidden FROM profiles WHERE id = 'aaaaaaaa-0000-4000-8000-0000000000a1'), true, 'A hides their space');

UPDATE profiles SET position = 9, hidden = true WHERE id = 'bbbbbbbb-0000-4000-8000-0000000000b1';
RESET ROLE;
SELECT ok(
  (SELECT position IS NULL AND NOT hidden FROM profiles WHERE id = 'bbbbbbbb-0000-4000-8000-0000000000b1'),
  'A can’t order or hide B’s space'
);

SELECT * FROM finish();
ROLLBACK;
