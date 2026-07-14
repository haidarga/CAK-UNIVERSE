-- ============================================================
-- MIGRATION 011: sw-imports storage bucket (CAKGPT file import)
--
-- Browser uploads (briefs/naskah content-plan files) go DIRECTLY to Supabase
-- Storage via a signed upload URL, bypassing Vercel's Serverless Function
-- request-body cap (hard 4.5 MB, not configurable) entirely. The app-level
-- limit is enforced by file_size_limit here + the matching check in the API
-- routes/components (currently 10 MB).
--
-- Private bucket, no public read. All programmatic access (mint signed
-- upload URLs, download, delete) goes through the service-role admin()
-- client, which bypasses RLS — so no storage.objects policies are needed.
-- Files are transient: the import route deletes the object right after
-- parsing it, whether extraction succeeds or fails.
-- ============================================================
-- No allowed_mime_types restriction: detectSourceKind() in brief-extract.ts
-- prefers file EXTENSION over the browser-reported Content-Type (browsers are
-- inconsistent about what mime type they send for .xlsx/.csv/.docx), and stays
-- the single source of truth for "is this a supported file". Locking mime
-- types at the storage layer would reject valid files the parser handles
-- fine, reintroducing an opaque-rejection bug of the same shape as the one
-- that prompted this migration.
insert into storage.buckets (id, name, public, file_size_limit)
values ('sw-imports', 'sw-imports', false, 10485760) -- 10 MB
on conflict (id) do update set file_size_limit = excluded.file_size_limit;
