-- Saved Library views (ROADMAP decision 15A, docs/library-views.md): tabs over
-- the Library, each a named set of filters with a layout and sort. Additive:
-- a new table only; nothing existing changes.
--
-- `definition` is the view as JSON, read forgivingly by @memex/core
-- (`parseViewDefinition`): { filters: { types, sources, spaces, tagIds,
-- untagged }, sort?: { field, direction }, layout?: 'grid' | 'list' | 'table' }.
-- Space and tag ids inside it are references, not foreign keys, so deleting a
-- space never deletes a view (the app drops ids that no longer exist). In the
-- vault this row becomes `views/<id>.json` (ROADMAP §3.3).
CREATE TABLE IF NOT EXISTS saved_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  definition JSONB DEFAULT '{}'::jsonb NOT NULL,
  position INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_views_user_position
  ON saved_views(user_id, position);

ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own saved views" ON saved_views;
CREATE POLICY "Users can view their own saved views" ON saved_views
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own saved views" ON saved_views;
CREATE POLICY "Users can insert their own saved views" ON saved_views
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own saved views" ON saved_views;
CREATE POLICY "Users can update their own saved views" ON saved_views
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own saved views" ON saved_views;
CREATE POLICY "Users can delete their own saved views" ON saved_views
  FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_saved_views_updated_at ON saved_views;
CREATE TRIGGER update_saved_views_updated_at BEFORE UPDATE ON saved_views
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
