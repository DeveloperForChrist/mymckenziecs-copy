-- Create private storage bucket for user uploads (25MB limit)
insert into storage.buckets (id, name, public, file_size_limit)
values ('user-uploads', 'user-uploads', false, 26214400)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

-- RLS policies for user-owned objects in user-uploads bucket
DROP POLICY IF EXISTS "Users can read own uploads" ON storage.objects;
CREATE POLICY "Users can read own uploads"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'user-uploads' AND auth.uid() = owner);

DROP POLICY IF EXISTS "Users can upload own files" ON storage.objects;
CREATE POLICY "Users can upload own files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'user-uploads' AND auth.uid() = owner);

DROP POLICY IF EXISTS "Users can update own uploads" ON storage.objects;
CREATE POLICY "Users can update own uploads"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'user-uploads' AND auth.uid() = owner);

DROP POLICY IF EXISTS "Users can delete own uploads" ON storage.objects;
CREATE POLICY "Users can delete own uploads"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'user-uploads' AND auth.uid() = owner);
