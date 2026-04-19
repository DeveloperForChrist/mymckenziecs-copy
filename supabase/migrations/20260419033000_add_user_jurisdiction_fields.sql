ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS country_code TEXT,
  ADD COLUMN IF NOT EXISTS jurisdiction_code TEXT,
  ADD COLUMN IF NOT EXISTS jurisdiction_label TEXT;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_country_code_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_country_code_check
  CHECK (
    country_code IS NULL
    OR country_code IN ('GB', 'US')
  );

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_jurisdiction_code_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_jurisdiction_code_check
  CHECK (
    jurisdiction_code IS NULL
    OR jurisdiction_code IN (
      'GB-ENG-WLS',
      'GB-SCT',
      'GB-NIR',
      'US-AL',
      'US-AK',
      'US-AZ',
      'US-AR',
      'US-CA',
      'US-CO',
      'US-CT',
      'US-DE',
      'US-DC',
      'US-FL',
      'US-GA',
      'US-HI',
      'US-ID',
      'US-IL',
      'US-IN',
      'US-IA',
      'US-KS',
      'US-KY',
      'US-LA',
      'US-ME',
      'US-MD',
      'US-MA',
      'US-MI',
      'US-MN',
      'US-MS',
      'US-MO',
      'US-MT',
      'US-NE',
      'US-NV',
      'US-NH',
      'US-NJ',
      'US-NM',
      'US-NY',
      'US-NC',
      'US-ND',
      'US-OH',
      'US-OK',
      'US-OR',
      'US-PA',
      'US-RI',
      'US-SC',
      'US-SD',
      'US-TN',
      'US-TX',
      'US-UT',
      'US-VT',
      'US-VA',
      'US-WA',
      'US-WV',
      'US-WI',
      'US-WY'
    )
  );

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_country_and_jurisdiction_required_together_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_country_and_jurisdiction_required_together_check
  CHECK (
    (country_code IS NULL AND jurisdiction_code IS NULL)
    OR (country_code IS NOT NULL AND jurisdiction_code IS NOT NULL)
  );
