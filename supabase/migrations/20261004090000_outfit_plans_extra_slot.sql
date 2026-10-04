-- More than one outfit on the same day ("I changed clothes").
--
-- Why: outfit_plans allows ONE general plan per user and date (UNIQUE (user_id, general_date)), so
-- saving an outfit photo on a day that already had a hand-made outfit was refused.
--
-- What: extra_slot = 0 is the day's main general outfit (every existing row), 1, 2… are further
-- outfits that day. general_date is recomputed so that it is set only for the main one; extra
-- outfits leave it NULL and never conflict.
--
-- Risks (checked before applying): existing rows keep extra_slot = 0 and the same general_date
-- (143 rows, 76 general, unchanged in a rolled-back dry run); the unique constraint keeps its name
-- and columns, so every existing upsert with onConflict "user_id,general_date" works unchanged;
-- the table is briefly locked while the generated column is rebuilt (small table).
ALTER TABLE public.outfit_plans
  ADD COLUMN extra_slot smallint NOT NULL DEFAULT 0
  CONSTRAINT outfit_plans_extra_slot_check CHECK (extra_slot >= 0);

ALTER TABLE public.outfit_plans DROP CONSTRAINT outfit_plans_one_general_per_date;
ALTER TABLE public.outfit_plans DROP COLUMN general_date;
ALTER TABLE public.outfit_plans
  ADD COLUMN general_date date GENERATED ALWAYS AS (
    CASE
      WHEN calendar_event_id IS NULL AND trip_id IS NULL AND extra_slot = 0 THEN date
      ELSE NULL
    END
  ) STORED;
ALTER TABLE public.outfit_plans
  ADD CONSTRAINT outfit_plans_one_general_per_date UNIQUE (user_id, general_date);
