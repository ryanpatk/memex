-- Capture provenance for links (ROADMAP Phase 3, CONTEXT.md → Sources).
-- Additive only: new nullable/defaulted columns, CHECKs that every existing
-- row already passes (the new columns are NULL/empty on them), and indexes.
--
--   source           already exists (20261018120000). From now on memex-api
--                    writes the platform: 'x' · 'pinterest' · 'youtube' · 'web'.
--                    Rows written before this keep their legacy tag
--                    ('extension', 'x:bookmark', 'pinterest:save'); readers
--                    understand both (@memex/core parseSourceTag).
--   source_id        the platform's own id (post id, pin id, video id)
--   lists            which of your lists on the source held it:
--                    'bookmarked' · 'saved' · 'liked' (one link can be on several)
--   captured_by      how it arrived: 'app' · 'extension' · 'resync' · 'share'
--                    · 'api' · 'agent' (NULL = before this migration)
--   captured_client  free-form client name, e.g. 'memex-extension/0.3.0'
--   url_key          normalized URL used as the dedupe fallback
--                    (@memex/core normalizeUrlKey); NULL on older rows, which
--                    memex-api still matches by URL variants

ALTER TABLE links ADD COLUMN IF NOT EXISTS source_id TEXT;
ALTER TABLE links ADD COLUMN IF NOT EXISTS lists TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE links ADD COLUMN IF NOT EXISTS captured_by TEXT;
ALTER TABLE links ADD COLUMN IF NOT EXISTS captured_client TEXT;
ALTER TABLE links ADD COLUMN IF NOT EXISTS url_key TEXT;

ALTER TABLE links ADD CONSTRAINT links_captured_by_check
  CHECK (captured_by IS NULL OR captured_by IN ('app', 'extension', 'resync', 'share', 'api', 'agent'));
ALTER TABLE links ADD CONSTRAINT links_source_id_check
  CHECK (source_id IS NULL OR (source IS NOT NULL AND length(source_id) BETWEEN 1 AND 128));
ALTER TABLE links ADD CONSTRAINT links_captured_client_check
  CHECK (captured_client IS NULL OR length(captured_client) <= 80);

-- Dedupe: one link per (user, source, source_id). Partial, so every row
-- without a source id (all rows before this migration) is unaffected. Checked
-- 2026-11-01: no two existing links share an X status / Pinterest pin /
-- YouTube video id, so a later source_id backfill can't collide either.
CREATE UNIQUE INDEX IF NOT EXISTS links_user_source_item_key
  ON links (user_id, source, source_id) WHERE source_id IS NOT NULL;

-- Fallback lookup by normalized URL. Not unique: production has 4 groups of
-- exact-URL duplicates saved in the app, and the app's own "Add link" may
-- still save a URL twice.
CREATE INDEX IF NOT EXISTS idx_links_user_url_key
  ON links (user_id, url_key) WHERE url_key IS NOT NULL;
