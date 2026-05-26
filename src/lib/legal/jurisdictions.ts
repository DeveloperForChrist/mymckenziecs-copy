export type SupportedCountryCode = 'GB' | 'US'

export type JurisdictionOption = {
  code: string
  label: string
}

export type UserLegalContext = {
  countryCode: SupportedCountryCode | null
  jurisdictionCode: string | null
  jurisdictionLabel: string | null
}

export type CountryOption = {
  code: SupportedCountryCode
  label: string
  jurisdictionLabel: string
  jurisdictions: JurisdictionOption[]
}

const UNITED_KINGDOM_JURISDICTIONS: JurisdictionOption[] = [
  { code: 'GB-ENG-WLS', label: 'England and Wales' },
  { code: 'GB-SCT', label: 'Scotland' },
  { code: 'GB-NIR', label: 'Northern Ireland' },
]

export const UNITED_STATES_JURISDICTIONS: JurisdictionOption[] = [
  { code: 'US-AL', label: 'Alabama' },
  { code: 'US-AK', label: 'Alaska' },
  { code: 'US-AZ', label: 'Arizona' },
  { code: 'US-AR', label: 'Arkansas' },
  { code: 'US-CA', label: 'California' },
  { code: 'US-CO', label: 'Colorado' },
  { code: 'US-CT', label: 'Connecticut' },
  { code: 'US-DE', label: 'Delaware' },
  { code: 'US-DC', label: 'District of Columbia' },
  { code: 'US-FL', label: 'Florida' },
  { code: 'US-GA', label: 'Georgia' },
  { code: 'US-HI', label: 'Hawaii' },
  { code: 'US-ID', label: 'Idaho' },
  { code: 'US-IL', label: 'Illinois' },
  { code: 'US-IN', label: 'Indiana' },
  { code: 'US-IA', label: 'Iowa' },
  { code: 'US-KS', label: 'Kansas' },
  { code: 'US-KY', label: 'Kentucky' },
  { code: 'US-LA', label: 'Louisiana' },
  { code: 'US-ME', label: 'Maine' },
  { code: 'US-MD', label: 'Maryland' },
  { code: 'US-MA', label: 'Massachusetts' },
  { code: 'US-MI', label: 'Michigan' },
  { code: 'US-MN', label: 'Minnesota' },
  { code: 'US-MS', label: 'Mississippi' },
  { code: 'US-MO', label: 'Missouri' },
  { code: 'US-MT', label: 'Montana' },
  { code: 'US-NE', label: 'Nebraska' },
  { code: 'US-NV', label: 'Nevada' },
  { code: 'US-NH', label: 'New Hampshire' },
  { code: 'US-NJ', label: 'New Jersey' },
  { code: 'US-NM', label: 'New Mexico' },
  { code: 'US-NY', label: 'New York' },
  { code: 'US-NC', label: 'North Carolina' },
  { code: 'US-ND', label: 'North Dakota' },
  { code: 'US-OH', label: 'Ohio' },
  { code: 'US-OK', label: 'Oklahoma' },
  { code: 'US-OR', label: 'Oregon' },
  { code: 'US-PA', label: 'Pennsylvania' },
  { code: 'US-RI', label: 'Rhode Island' },
  { code: 'US-SC', label: 'South Carolina' },
  { code: 'US-SD', label: 'South Dakota' },
  { code: 'US-TN', label: 'Tennessee' },
  { code: 'US-TX', label: 'Texas' },
  { code: 'US-UT', label: 'Utah' },
  { code: 'US-VT', label: 'Vermont' },
  { code: 'US-VA', label: 'Virginia' },
  { code: 'US-WA', label: 'Washington' },
  { code: 'US-WV', label: 'West Virginia' },
  { code: 'US-WI', label: 'Wisconsin' },
  { code: 'US-WY', label: 'Wyoming' },
]

export const SUPPORTED_COUNTRIES: CountryOption[] = [
  {
    code: 'GB',
    label: 'United Kingdom',
    jurisdictionLabel: 'Jurisdiction',
    jurisdictions: UNITED_KINGDOM_JURISDICTIONS,
  },
  {
    code: 'US',
    label: 'United States',
    jurisdictionLabel: 'State / District',
    jurisdictions: UNITED_STATES_JURISDICTIONS,
  },
]

const countryMap = new Map(SUPPORTED_COUNTRIES.map((country) => [country.code, country]))
const unitedStatesJurisdictionMap = new Map(UNITED_STATES_JURISDICTIONS.map((jurisdiction) => [jurisdiction.code, jurisdiction]))

const US_STATE_ABBREVIATIONS = new Map(
  UNITED_STATES_JURISDICTIONS.map((jurisdiction) => [jurisdiction.code, jurisdiction.code.replace(/^US-/, '')])
)

const US_FEDERAL_CIRCUITS_BY_STATE: Record<string, string> = {
  AL: 'ca11',
  AK: 'ca9',
  AZ: 'ca9',
  AR: 'ca8',
  CA: 'ca9',
  CO: 'ca10',
  CT: 'ca2',
  DE: 'ca3',
  DC: 'cadc',
  FL: 'ca11',
  GA: 'ca11',
  HI: 'ca9',
  ID: 'ca9',
  IL: 'ca7',
  IN: 'ca7',
  IA: 'ca8',
  KS: 'ca10',
  KY: 'ca6',
  LA: 'ca5',
  ME: 'ca1',
  MD: 'ca4',
  MA: 'ca1',
  MI: 'ca6',
  MN: 'ca8',
  MS: 'ca5',
  MO: 'ca8',
  MT: 'ca9',
  NE: 'ca8',
  NV: 'ca9',
  NH: 'ca1',
  NJ: 'ca3',
  NM: 'ca10',
  NY: 'ca2',
  NC: 'ca4',
  ND: 'ca8',
  OH: 'ca6',
  OK: 'ca10',
  OR: 'ca9',
  PA: 'ca3',
  RI: 'ca1',
  SC: 'ca4',
  SD: 'ca8',
  TN: 'ca6',
  TX: 'ca5',
  UT: 'ca10',
  VT: 'ca2',
  VA: 'ca4',
  WA: 'ca9',
  WV: 'ca4',
  WI: 'ca7',
  WY: 'ca10',
}

export function getCountryOption(countryCode?: string | null): CountryOption | null {
  if (!countryCode) return null
  return countryMap.get(countryCode as SupportedCountryCode) || null
}

export function getJurisdictionOptions(countryCode?: string | null): JurisdictionOption[] {
  return getCountryOption(countryCode)?.jurisdictions || []
}

export function isSupportedCountryCode(countryCode?: string | null): countryCode is SupportedCountryCode {
  return Boolean(countryCode && countryMap.has(countryCode as SupportedCountryCode))
}

export function isSupportedJurisdictionCode(countryCode?: string | null, jurisdictionCode?: string | null) {
  if (!countryCode || !jurisdictionCode) return false
  return getJurisdictionOptions(countryCode).some((option) => option.code === jurisdictionCode)
}

export function getJurisdictionLabel(countryCode?: string | null, jurisdictionCode?: string | null): string | null {
  if (!countryCode || !jurisdictionCode) return null
  return getJurisdictionOptions(countryCode).find((option) => option.code === jurisdictionCode)?.label || null
}

export function getUnitedStatesJurisdictionTarget(context?: UserLegalContext | null) {
  if (!isUnitedStatesContext(context) || !context?.jurisdictionCode) return null

  const jurisdiction = unitedStatesJurisdictionMap.get(context.jurisdictionCode)
  if (!jurisdiction) return null

  const abbreviation = US_STATE_ABBREVIATIONS.get(jurisdiction.code)
  if (!abbreviation) return null

  return {
    code: jurisdiction.code,
    label: jurisdiction.label,
    abbreviation,
    federalCircuit: US_FEDERAL_CIRCUITS_BY_STATE[abbreviation] || null,
  }
}

export function isUnitedKingdomContext(context?: UserLegalContext | null) {
  return context?.countryCode === 'GB'
}

export function isUnitedStatesContext(context?: UserLegalContext | null) {
  return context?.countryCode === 'US'
}

export function getLegalSystemDescriptor(context?: UserLegalContext | null): string {
  if (isUnitedKingdomContext(context)) {
    const jurisdictionLabel = context?.jurisdictionLabel || 'the United Kingdom'
    return `${jurisdictionLabel} legal system`
  }
  if (isUnitedStatesContext(context)) {
    const jurisdictionLabel = context?.jurisdictionLabel || 'the relevant U.S. state or district'
    return `${jurisdictionLabel} legal system in the United States`
  }
  return 'the user’s legal jurisdiction'
}

export function getSearchCountryCode(context?: UserLegalContext | null): SupportedCountryCode {
  return context?.countryCode === 'US' ? 'US' : 'GB'
}

export function buildJurisdictionSearchSuffix(context?: UserLegalContext | null): string {
  if (isUnitedKingdomContext(context)) {
    return context?.jurisdictionLabel ? context.jurisdictionLabel : 'United Kingdom'
  }
  if (isUnitedStatesContext(context)) {
    return context?.jurisdictionLabel
      ? `${context.jurisdictionLabel} United States`
      : 'United States'
  }
  return ''
}
