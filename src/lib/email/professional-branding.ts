import { supabaseAdmin } from '@/lib/database/supabase-server'

export type ProfessionalEmailBranding = {
  businessName: string
  displayName: string
  logoUrl: string | null
  heroImageUrl: string | null
  contactEmail: string | null
  website: string | null
}

function asString(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || null
}

export async function loadProfessionalEmailBranding(ownerUserId: string, fallbackName?: string | null) {
  const [profileResult, businessResult] = await Promise.all([
    supabaseAdmin
      .from('professional_profiles')
      .select('display_name,business_name,email,website,profile_image_url,cover_image_url')
      .eq('owner_id', ownerUserId)
      .maybeSingle(),
    supabaseAdmin
      .from('businesses')
      .select('name,billing_email')
      .eq('owner_user_id', ownerUserId)
      .limit(1)
      .maybeSingle(),
  ])

  const profile = profileResult.data || null
  const business = businessResult.data || null

  const businessName =
    asString(profile?.business_name) ||
    asString(business?.name) ||
    asString(fallbackName) ||
    'MyMcKenzieCS Professional'

  const displayName =
    asString(profile?.display_name) ||
    asString(fallbackName) ||
    businessName

  const branding: ProfessionalEmailBranding = {
    businessName,
    displayName,
    logoUrl: asString(profile?.profile_image_url),
    heroImageUrl: asString(profile?.cover_image_url),
    contactEmail: asString(profile?.email) || asString(business?.billing_email),
    website: asString(profile?.website),
  }

  return branding
}
