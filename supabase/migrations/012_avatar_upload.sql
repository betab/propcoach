-- 012_avatar_upload.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Profile avatar upload. avatar_url follows the exact same self-write pattern
-- as display_name (see 004_lock_down_profile_columns.sql) — a plain column
-- an authenticated user can update on their own row, nothing more.
--
-- Storage: a public "avatars" bucket, one object per user at
-- "{user_id}/avatar.{ext}" (re-uploading overwrites the same path — the app
-- adds a cache-busting query param to the stored URL so a browser never
-- serves a stale image after a re-upload). Policies restrict writes to a
-- user's own folder (first path segment = their own auth.uid()), matching
-- Supabase's own documented pattern for user-owned storage objects. Reads
-- are public — avatars aren't sensitive, and this avoids needing a signed
-- URL just to render a header/profile image.
--
-- Run this in: Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN avatar_url TEXT;

GRANT UPDATE (avatar_url) ON profiles TO authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Avatar images are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can replace their own avatar"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own avatar"
ON storage.objects FOR DELETE
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
