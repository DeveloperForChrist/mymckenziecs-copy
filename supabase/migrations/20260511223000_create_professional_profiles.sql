-- Marketplace-style directory profiles for McKenzie Friends and legal professionals.
CREATE TABLE IF NOT EXISTS public.professional_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  business_name TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'McKenzie Friend',
  headline TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  postcode TEXT NOT NULL DEFAULT '',
  experience_years INTEGER CHECK (experience_years IS NULL OR (experience_years >= 0 AND experience_years <= 80)),
  starting_price INTEGER CHECK (starting_price IS NULL OR starting_price >= 0),
  response_time TEXT NOT NULL DEFAULT 'Within 24 hours',
  profile_image_url TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT NOT NULL DEFAULT '',
  areas_of_law TEXT[] NOT NULL DEFAULT '{}',
  languages TEXT[] NOT NULL DEFAULT '{English}',
  services TEXT[] NOT NULL DEFAULT '{}',
  availability TEXT NOT NULL DEFAULT 'both' CHECK (availability IN ('in-person', 'remote', 'both')),
  qualifications TEXT NOT NULL DEFAULT '',
  offers_video_consultations BOOLEAN NOT NULL DEFAULT TRUE,
  instant_response BOOLEAN NOT NULL DEFAULT FALSE,
  visible BOOLEAN NOT NULL DEFAULT FALSE,
  rating NUMERIC(2, 1) CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
  review_count INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_id)
);

CREATE INDEX IF NOT EXISTS professional_profiles_visible_idx
  ON public.professional_profiles (visible, updated_at DESC);

CREATE INDEX IF NOT EXISTS professional_profiles_city_idx
  ON public.professional_profiles (city);

CREATE INDEX IF NOT EXISTS professional_profiles_areas_gin_idx
  ON public.professional_profiles USING GIN (areas_of_law);

ALTER TABLE public.professional_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "professional_profiles: visible public select" ON public.professional_profiles;
CREATE POLICY "professional_profiles: visible public select"
  ON public.professional_profiles
  FOR SELECT
  USING (visible = TRUE);

DROP POLICY IF EXISTS "professional_profiles: owner select" ON public.professional_profiles;
CREATE POLICY "professional_profiles: owner select"
  ON public.professional_profiles
  FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "professional_profiles: owner insert" ON public.professional_profiles;
CREATE POLICY "professional_profiles: owner insert"
  ON public.professional_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "professional_profiles: owner update" ON public.professional_profiles;
CREATE POLICY "professional_profiles: owner update"
  ON public.professional_profiles
  FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "professional_profiles: owner delete" ON public.professional_profiles;
CREATE POLICY "professional_profiles: owner delete"
  ON public.professional_profiles
  FOR DELETE
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "professional_profiles: service role" ON public.professional_profiles;
CREATE POLICY "professional_profiles: service role"
  ON public.professional_profiles
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Public media bucket for profile photos and directory listing covers.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'professional-profile-media',
  'professional-profile-media',
  TRUE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "professional_profile_media: public read" ON storage.objects;
CREATE POLICY "professional_profile_media: public read"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'professional-profile-media');

DROP POLICY IF EXISTS "professional_profile_media: owner insert" ON storage.objects;
CREATE POLICY "professional_profile_media: owner insert"
  ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'professional-profile-media' AND auth.uid() = owner);

DROP POLICY IF EXISTS "professional_profile_media: owner update" ON storage.objects;
CREATE POLICY "professional_profile_media: owner update"
  ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'professional-profile-media' AND auth.uid() = owner)
  WITH CHECK (bucket_id = 'professional-profile-media' AND auth.uid() = owner);

DROP POLICY IF EXISTS "professional_profile_media: owner delete" ON storage.objects;
CREATE POLICY "professional_profile_media: owner delete"
  ON storage.objects
  FOR DELETE
  USING (bucket_id = 'professional-profile-media' AND auth.uid() = owner);
