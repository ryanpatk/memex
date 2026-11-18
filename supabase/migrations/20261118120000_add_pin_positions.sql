-- Pin order (2026-11-18, approved by Ryan): pinned sites can be dragged into
-- your own order in the top bar and the Pinned launcher. Additive only:
--   links.pin_position          order of the global pins (links.is_super_favorite)
--   profile_links.pin_position  order of a space's pins (profile_links.is_super_favorite)
-- Both are nullable; NULL means unpinned, or pinned without a place yet (those
-- sort after the numbered ones, by name). Lower numbers come first.
--
-- The backfill numbers today's pins in the order the app showed them: by name
-- (the trimmed title, else the URL), case-insensitive, ties by id. It writes
-- only the new columns of pinned rows. The links triggers that stamp
-- updated_at and the project's last_modified are paused for the backfill, so
-- no existing value changes.

ALTER TABLE public.links ADD COLUMN IF NOT EXISTS pin_position integer;
ALTER TABLE public.profile_links ADD COLUMN IF NOT EXISTS pin_position integer;

ALTER TABLE public.links DISABLE TRIGGER update_links_updated_at;
ALTER TABLE public.links DISABLE TRIGGER update_project_last_modified_on_links_change;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id
      ORDER BY lower(coalesce(nullif(btrim(title), ''), url)), id
    ) AS position
  FROM public.links
  WHERE is_super_favorite AND pin_position IS NULL
)
UPDATE public.links AS l
SET pin_position = ranked.position
FROM ranked
WHERE l.id = ranked.id;

ALTER TABLE public.links ENABLE TRIGGER update_links_updated_at;
ALTER TABLE public.links ENABLE TRIGGER update_project_last_modified_on_links_change;

WITH ranked AS (
  SELECT
    pl.id,
    row_number() OVER (
      PARTITION BY pl.profile_id
      ORDER BY lower(coalesce(nullif(btrim(l.title), ''), l.url)), l.id
    ) AS position
  FROM public.profile_links AS pl
  JOIN public.links AS l ON l.id = pl.link_id
  WHERE pl.is_super_favorite AND pl.pin_position IS NULL
)
UPDATE public.profile_links AS pl
SET pin_position = ranked.position
FROM ranked
WHERE pl.id = ranked.id;
