-- 020_sw_clients_brand_context.sql
-- Brand & Market Context per client.
--
-- Replaces the free-text `notes` box as the thing the machine reads. `notes`
-- itself is KEPT (not dropped, not backfilled) so no existing content is lost —
-- the app offers an AI pass that splits an old note into these fields, and the
-- writer reviews the result before it is saved.
--
-- One JSONB column rather than nine text columns: adding a tenth field later is
-- a code change instead of another production migration, and none of these are
-- ever filtered on in SQL.
--
-- Shape (all keys optional, all string, '' when unset):
--   profil_brand, posisi_brand, konteks_pasar, cara_pengucapan,
--   tagline_kampanye, product_usps, boleh, dilarang, wajib_gunakan
--
-- `dilarang` and `wajib_gunakan` are newline-delimited lists: each line becomes
-- a deterministic QC rule (banned word / required word) on top of the persona's
-- own lists.

alter table sw_clients
  add column if not exists brand_context jsonb not null default '{}'::jsonb;

comment on column sw_clients.brand_context is
  'Brand & Market Context. Injected into the naskah generation prompt above the brief, and the dilarang/wajib_gunakan lines feed the rule-based QC pass.';
