import { supabaseAdmin } from '@/lib/database/supabase-server'
import {
  isUnitedStatesContext,
  isUnitedKingdomContext,
  type SupportedCountryCode,
  type UserLegalContext,
} from '@/lib/legal/jurisdictions'

type UserMetadataContext = {
  country_code?: string | null
  jurisdiction_code?: string | null
  jurisdiction_label?: string | null
} | null | undefined

export async function getUserLegalContext(
  userId: string,
  fallbackMetadata?: UserMetadataContext
): Promise<UserLegalContext> {
  if (!userId) {
    return {
      countryCode: null,
      jurisdictionCode: null,
      jurisdictionLabel: null,
    }
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('email, country_code, jurisdiction_code, jurisdiction_label')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('Failed to load user legal context', error)
  }

  const email = String((data as any)?.email || '').toLowerCase()
  const isDemoAccount = email.endsWith('@demo.com')

  return {
    countryCode: (isDemoAccount ? 'GB' : ((data as any)?.country_code || fallbackMetadata?.country_code || null)) as SupportedCountryCode | null,
    jurisdictionCode: isDemoAccount
      ? ((data as any)?.jurisdiction_code || fallbackMetadata?.jurisdiction_code || 'GB-ENG-WLS')
      : ((data as any)?.jurisdiction_code || fallbackMetadata?.jurisdiction_code || null),
    jurisdictionLabel: isDemoAccount
      ? ((data as any)?.jurisdiction_label || fallbackMetadata?.jurisdiction_label || 'England and Wales')
      : ((data as any)?.jurisdiction_label || fallbackMetadata?.jurisdiction_label || null),
  }
}

export function isCaseLawAvailableForLegalContext(context?: UserLegalContext | null): boolean {
  if (isUnitedKingdomContext(context)) return true
  if (isUnitedStatesContext(context)) {
    return Boolean(process.env.US_MILVUS_HOST || process.env.MILVUS_US_HOST)
  }
  return false
}
