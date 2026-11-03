-- Same-owner checks (M7, docs/security-audit.md). Closes the gap where a row
-- could point at ANOTHER user's row: moving a jot into someone else's space
-- (self_messages UPDATE had no WITH CHECK on profile_id), a link on someone
-- else's legacy project or tag, and membership/tag joins or agent rows
-- written by memex-api with the service role (which bypasses RLS).
--
-- Additive only: one trigger function, triggers, and RESTRICTIVE policies
-- (ANDed with the existing ones, so they can only narrow what's allowed).
-- Nothing is dropped, renamed or rewritten. Checked read-only before
-- applying (2026-11-02): no existing row breaks any rule below. The triggers
-- only look at a row when it's written and one of its owner/reference
-- columns changes, so editing an old row's text never trips them.
--
-- Why triggers and not only RLS: RLS covers the app (the `authenticated`
-- role); memex-api writes with the service role, which skips RLS. A BEFORE
-- trigger runs for every role, so the database itself refuses a mismatched
-- owner whoever writes. Restores load data with
-- session_replication_role = replica (docs/backups.md), which skips triggers.

-- ── 1. The check ────────────────────────────────────────────────────────────
-- Arguments come in pairs: (referenced table, column on this row). The row's
-- owner is its own user_id when it has one; join tables (profile_links,
-- link_tags, …) have none, so the first non-NULL reference's owner is the
-- owner and every other reference must match it. NULL references are skipped
-- (Home jots have profile_id NULL). A reference to a row that doesn't exist
-- is refused too (the foreign key would refuse it anyway).
--
-- SECURITY DEFINER so it sees the referenced row whoever is writing (RLS
-- would hide another user's row and make the mismatch look like "missing").
-- It reads only `user_id` by primary key and returns nothing to the caller.
CREATE OR REPLACE FUNCTION public.memex_assert_same_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_row jsonb := to_jsonb(NEW);
  old_row jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  owner uuid := (new_row ->> 'user_id')::uuid;
  ref_table text;
  ref_column text;
  ref_id uuid;
  ref_owner uuid;
  changed boolean := TG_OP = 'INSERT';
  i int := 0;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    changed := (new_row -> 'user_id') IS DISTINCT FROM (old_row -> 'user_id');
    WHILE i < TG_NARGS LOOP
      changed := changed OR (new_row -> TG_ARGV[i + 1]) IS DISTINCT FROM (old_row -> TG_ARGV[i + 1]);
      i := i + 2;
    END LOOP;
    IF NOT changed THEN
      RETURN NEW;
    END IF;
    i := 0;
  END IF;

  WHILE i < TG_NARGS LOOP
    ref_table := TG_ARGV[i];
    ref_column := TG_ARGV[i + 1];
    ref_id := (new_row ->> ref_column)::uuid;
    IF ref_id IS NOT NULL THEN
      EXECUTE format('SELECT user_id FROM public.%I WHERE id = $1', ref_table)
        INTO ref_owner USING ref_id;
      IF ref_owner IS NULL OR (owner IS NOT NULL AND ref_owner <> owner) THEN
        RAISE EXCEPTION 'memex: %.% must reference a % row owned by the same user', TG_TABLE_NAME, ref_column, ref_table
          USING ERRCODE = '42501'; -- insufficient_privilege, like an RLS refusal
      END IF;
      owner := ref_owner;
    END IF;
    i := i + 2;
  END LOOP;
  RETURN NEW;
END;
$$;

-- Inbox proposals point at an item by (item_type, item_id), not a foreign
-- key; the item must be the proposal owner's own link, note or task.
CREATE OR REPLACE FUNCTION public.memex_assert_proposal_item_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  item_owner uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
     AND NEW.item_type IS NOT DISTINCT FROM OLD.item_type
     AND NEW.item_id IS NOT DISTINCT FROM OLD.item_id THEN
    RETURN NEW;
  END IF;
  item_owner := CASE NEW.item_type
    WHEN 'link' THEN (SELECT user_id FROM public.links WHERE id = NEW.item_id)
    WHEN 'note' THEN (SELECT user_id FROM public.notes WHERE id = NEW.item_id)
    WHEN 'task' THEN (SELECT user_id FROM public.tasks WHERE id = NEW.item_id)
  END;
  IF item_owner IS NULL OR item_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'memex: inbox_proposals.item_id must be a % owned by the same user', NEW.item_type
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger functions can't be called directly, but keep them off the API anyway.
REVOKE ALL ON FUNCTION public.memex_assert_same_owner() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.memex_assert_proposal_item_owner() FROM PUBLIC, anon, authenticated;

-- ── 2. Where it applies ─────────────────────────────────────────────────────
-- Jots: the space a jot is in (the M7 gap: "File to…" / drag could name any id).
DROP TRIGGER IF EXISTS memex_same_owner ON public.self_messages;
CREATE TRIGGER memex_same_owner BEFORE INSERT OR UPDATE ON public.self_messages
  FOR EACH ROW EXECUTE FUNCTION public.memex_assert_same_owner('profiles', 'profile_id');

-- Links: the hidden legacy project every link needs, and the legacy single tag.
DROP TRIGGER IF EXISTS memex_same_owner ON public.links;
CREATE TRIGGER memex_same_owner BEFORE INSERT OR UPDATE ON public.links
  FOR EACH ROW EXECUTE FUNCTION public.memex_assert_same_owner('projects', 'project_id', 'tags', 'tag_id');

-- Space membership (filing, pinning: profile_links.is_super_favorite lives here).
DROP TRIGGER IF EXISTS memex_same_owner ON public.profile_links;
CREATE TRIGGER memex_same_owner BEFORE INSERT OR UPDATE ON public.profile_links
  FOR EACH ROW EXECUTE FUNCTION public.memex_assert_same_owner('profiles', 'profile_id', 'links', 'link_id');
DROP TRIGGER IF EXISTS memex_same_owner ON public.profile_notes;
CREATE TRIGGER memex_same_owner BEFORE INSERT OR UPDATE ON public.profile_notes
  FOR EACH ROW EXECUTE FUNCTION public.memex_assert_same_owner('profiles', 'profile_id', 'notes', 'note_id');
DROP TRIGGER IF EXISTS memex_same_owner ON public.profile_tasks;
CREATE TRIGGER memex_same_owner BEFORE INSERT OR UPDATE ON public.profile_tasks
  FOR EACH ROW EXECUTE FUNCTION public.memex_assert_same_owner('profiles', 'profile_id', 'tasks', 'task_id');

-- Tags.
DROP TRIGGER IF EXISTS memex_same_owner ON public.link_tags;
CREATE TRIGGER memex_same_owner BEFORE INSERT OR UPDATE ON public.link_tags
  FOR EACH ROW EXECUTE FUNCTION public.memex_assert_same_owner('links', 'link_id', 'tags', 'tag_id');
DROP TRIGGER IF EXISTS memex_same_owner ON public.note_tags;
CREATE TRIGGER memex_same_owner BEFORE INSERT OR UPDATE ON public.note_tags
  FOR EACH ROW EXECUTE FUNCTION public.memex_assert_same_owner('notes', 'note_id', 'tags', 'tag_id');
DROP TRIGGER IF EXISTS memex_same_owner ON public.task_tags;
CREATE TRIGGER memex_same_owner BEFORE INSERT OR UPDATE ON public.task_tags
  FOR EACH ROW EXECUTE FUNCTION public.memex_assert_same_owner('tasks', 'task_id', 'tags', 'tag_id');

-- Agent rows (written by memex-api with the service role).
DROP TRIGGER IF EXISTS memex_same_owner ON public.inbox_proposals;
CREATE TRIGGER memex_same_owner BEFORE INSERT OR UPDATE ON public.inbox_proposals
  FOR EACH ROW EXECUTE FUNCTION public.memex_assert_same_owner('profiles', 'space_id', 'agent_tokens', 'token_id');
DROP TRIGGER IF EXISTS memex_same_owner_item ON public.inbox_proposals;
CREATE TRIGGER memex_same_owner_item BEFORE INSERT OR UPDATE ON public.inbox_proposals
  FOR EACH ROW EXECUTE FUNCTION public.memex_assert_proposal_item_owner();
DROP TRIGGER IF EXISTS memex_same_owner ON public.mcp_audit_log;
CREATE TRIGGER memex_same_owner BEFORE INSERT OR UPDATE ON public.mcp_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.memex_assert_same_owner('agent_tokens', 'token_id');

-- ── 3. The same rule in RLS, for the app's own writes ───────────────────────
-- The policies that had no WITH CHECK on a reference column. RESTRICTIVE
-- policies are ANDed with the existing permissive ones, so these only narrow
-- them; the triggers above already enforce the rule, and these make it
-- visible (and refused at the RLS layer) for anyone auditing the policies.
DROP POLICY IF EXISTS "Jots stay in the owner's spaces" ON public.self_messages;
CREATE POLICY "Jots stay in the owner's spaces" ON public.self_messages
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    profile_id IS NULL
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = profile_id AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Links reference the owner's project and tag (insert)" ON public.links;
CREATE POLICY "Links reference the owner's project and tag (insert)" ON public.links
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
    AND (tag_id IS NULL OR EXISTS (SELECT 1 FROM public.tags t WHERE t.id = tag_id AND t.user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Links reference the owner's project and tag (update)" ON public.links;
CREATE POLICY "Links reference the owner's project and tag (update)" ON public.links
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.user_id = auth.uid())
    AND (tag_id IS NULL OR EXISTS (SELECT 1 FROM public.tags t WHERE t.id = tag_id AND t.user_id = auth.uid()))
  );
