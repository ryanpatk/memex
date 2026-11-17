-- A colour the user chooses for each space (Memory Cards decision x11 B,
-- design/memory-cards/REFINEMENT-NOTES.md §4, 2026-11-16). Additive: one new
-- nullable column; existing rows stay NULL, which means “automatic colour”
-- (assigned in creation order by @memex/core buildSpaceColors), exactly as
-- today. Nothing existing changes or is rewritten.
--
-- The value is a lowercase #rrggbb hex (the app offers the eight Memory Cards
-- space colours). The CHECK only constrains new values; every existing row is
-- NULL and passes. In the vault it becomes `color:` in the space's
-- frontmatter (docs/vault-format.md).
--
-- NOT APPLIED to production. Applying it needs Ryan's OK and a backup first
-- (scripts/backup-supabase.sh, then `supabase db push`). The app works without
-- it: reads never see a colour, and writes that name it retry without it.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS color TEXT
  CHECK (color IS NULL OR color ~ '^#[0-9a-f]{6}$');

COMMENT ON COLUMN profiles.color IS 'User-chosen space colour (#rrggbb), NULL = automatic.';
