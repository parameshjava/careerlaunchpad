-- ============================================================================
-- 122_income_bands_annual.sql
-- Replace the household-income bands with ANNUAL tiers. Migration 121 seeded
-- MONTHLY bands (₹10k–₹1L), which are meaningless read as annual income. The
-- new tiers use boundaries that actually gate fee support / scholarships in AP
-- & nationally, so a student's band maps directly to what they may qualify for:
--   ePASS BC/EBC   ≈ ₹1L      (below_1l / 1l_to_2_5l)
--   ePASS SC/ST    ≈ ₹2–2.5L  (1l_to_2_5l)
--   EWS ceiling      ₹8L      (5l_to_8l boundary)
--
-- Idempotent and safe on any database:
--   * already-migrated (121 ran) → old monthly slugs deleted, annual upserted;
--   * fresh replay (121 has monthly too) → same net effect;
--   * income_band is a plain text column (NOT an FK), so removing old ref rows
--     never breaks existing student_profile rows.
-- ============================================================================

-- Drop the obsolete monthly bands.
delete from public.ref_income_band
where slug in ('below_10k', '10k_25k', '25k_50k', '50k_100k', 'above_100k');

-- Upsert the annual bands (corrects label/order/active even if a row exists).
insert into public.ref_income_band (slug, label, sort_order, is_active) values
  ('below_1l',       'Below ₹1 lakh',     1, true),
  ('1l_to_2_5l',     '₹1 – 2.5 lakh',     2, true),
  ('2_5l_to_5l',     '₹2.5 – 5 lakh',     3, true),
  ('5l_to_8l',       '₹5 – 8 lakh',       4, true),
  ('8l_to_15l',      '₹8 – 15 lakh',      5, true),
  ('above_15l',      'Above ₹15 lakh',    6, true),
  ('prefer_not_say', 'Prefer not to say', 7, true)
on conflict (slug) do update
  set label = excluded.label, sort_order = excluded.sort_order, is_active = true;
