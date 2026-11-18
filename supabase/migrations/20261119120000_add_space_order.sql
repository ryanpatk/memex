-- Space order and hiding (2026-11-19, approved by Ryan): spaces can be put in
-- your own order in Edit spaces (web) or by long-press (phone), and hidden
-- from the space pill row without moving them. Additive only:
--   profiles.position  nullable integer; lower comes first. NULL sorts after
--                      the numbered ones, by created_at (a new space lands at
--                      the end).
--   profiles.hidden    boolean, default false. A hidden space leaves the pill
--                      rows (Cards, Tasks, a space board's bar, the phone's
--                      Cards pills) but stays in More, Move to…, File to…, ⌘K,
--                      the drop tray and the phone's Spaces tab.
--
-- The backfill numbers each user's spaces 1…n by created_at (ties by id),
-- which is today's order, and writes only the new column. The updated_at
-- trigger is paused for it so no existing value changes. Space colours stay
-- tied to created_at (core buildSpaceColors), so nothing repaints.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS position integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.position IS 'Order of the space (1 first); NULL sorts after numbered spaces, by created_at.';
COMMENT ON COLUMN public.profiles.hidden IS 'Hidden from the space pill rows; still in More, Move to, the drop tray and search.';

ALTER TABLE public.profiles DISABLE TRIGGER update_profiles_updated_at;

-- (Numbers continue after any a user already has, so a re-run never repeats one.)
WITH placed AS (
  SELECT user_id, max(position) AS top FROM public.profiles GROUP BY user_id
),
ranked AS (
  SELECT
    p.id,
    coalesce(placed.top, 0) + row_number() OVER (PARTITION BY p.user_id ORDER BY p.created_at, p.id) AS position
  FROM public.profiles AS p
  JOIN placed ON placed.user_id = p.user_id
  WHERE p.position IS NULL
)
UPDATE public.profiles AS p
SET position = ranked.position
FROM ranked
WHERE p.id = ranked.id;

ALTER TABLE public.profiles ENABLE TRIGGER update_profiles_updated_at;
