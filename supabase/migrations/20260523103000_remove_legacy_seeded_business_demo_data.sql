-- Remove legacy seeded demo leads/matters that were previously auto-inserted
-- into real business workspaces.
WITH legacy_leads AS (
  SELECT id
  FROM public.business_leads
  WHERE email IN (
    'james.okafor@email.com',
    'priya.sharma@gmail.com',
    'd.clarke@outlook.com',
    'angela.m@yahoo.co.uk'
  )
    AND name IN (
      'James Okafor',
      'Priya Sharma',
      'David Clarke',
      'Angela Mensah'
    )
    AND source IN ('portal', 'referral')
)
DELETE FROM public.client_matters
WHERE lead_id IN (SELECT id FROM legacy_leads);

DELETE FROM public.business_leads
WHERE id IN (
  SELECT id
  FROM public.business_leads
  WHERE email IN (
    'james.okafor@email.com',
    'priya.sharma@gmail.com',
    'd.clarke@outlook.com',
    'angela.m@yahoo.co.uk'
  )
    AND name IN (
      'James Okafor',
      'Priya Sharma',
      'David Clarke',
      'Angela Mensah'
    )
    AND source IN ('portal', 'referral')
);
