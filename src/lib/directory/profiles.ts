export const AREAS_OF_LAW = [
  'Housing & Disrepair',
  'Employment',
  'Family & Children',
  'Small Claims',
  'Immigration',
  'Debt & Benefits',
  'Civil Litigation',
  'Criminal (Magistrates)',
  'Landlord & Tenant',
  'Personal Injury',
  'Consumer Rights',
  'Judicial Review',
  'Court Bundles',
  'Witness Statements',
  'Appeals',
]

export const LANGUAGES = [
  'English',
  'Welsh',
  'French',
  'Arabic',
  'Urdu',
  'Polish',
  'Punjabi',
  'Bengali',
  'Somali',
  'Spanish',
  'Mandarin',
  'Yoruba',
]

export const PROFESSIONAL_TYPES = [
  'McKenzie Friend',
  'Legal Consultant',
  'Paralegal',
  'Lay Representative',
  'Legal Advisor',
  'Law Student (supervised)',
]

export const SERVICE_OPTIONS = [
  'Court hearing support',
  'Document drafting',
  'Bundle preparation',
  'Case strategy session',
  'Form completion',
  'Settlement preparation',
  'Remote consultation',
  'In-person support',
]

export type DirectoryAvailability = 'in-person' | 'remote' | 'both'

export const AVAILABILITY_LABELS: Record<DirectoryAvailability, string> = {
  'in-person': 'In person',
  remote: 'Remote',
  both: 'In person & remote',
}

export interface ProfessionalProfile {
  id: string
  ownerId: string
  displayName: string
  businessName: string
  type: string
  headline: string
  bio: string
  phone: string
  email: string
  website: string
  city: string
  postcode: string
  experienceYears: number | null
  startingPrice: number | null
  responseTime: string
  profileImageUrl: string
  coverImageUrl: string
  areasOfLaw: string[]
  languages: string[]
  services: string[]
  availability: DirectoryAvailability
  qualifications: string
  offersVideoConsultations: boolean
  instantResponse: boolean
  visible: boolean
  rating: number | null
  reviewCount: number
  createdAt?: string
  updatedAt?: string
}

export type ProfessionalProfileInput = Omit<
  ProfessionalProfile,
  'id' | 'ownerId' | 'createdAt' | 'updatedAt' | 'rating' | 'reviewCount'
> & {
  rating?: number | null
  reviewCount?: number
}

export const EMPTY_PROFESSIONAL_PROFILE: ProfessionalProfileInput = {
  displayName: '',
  businessName: '',
  type: 'McKenzie Friend',
  headline: '',
  bio: '',
  phone: '',
  email: '',
  website: '',
  city: '',
  postcode: '',
  experienceYears: null,
  startingPrice: null,
  responseTime: 'Within 24 hours',
  profileImageUrl: '',
  coverImageUrl: '',
  areasOfLaw: [],
  languages: ['English'],
  services: [],
  availability: 'both',
  qualifications: '',
  offersVideoConsultations: true,
  instantResponse: false,
  visible: false,
  rating: null,
  reviewCount: 0,
}

const toStringValue = (value: unknown): string => (typeof value === 'string' ? value : '')

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

const toNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const toAvailability = (value: unknown): DirectoryAvailability => {
  return value === 'in-person' || value === 'remote' || value === 'both' ? value : 'both'
}

export function mapProfessionalProfileRow(row: Record<string, unknown> | null | undefined): ProfessionalProfile {
  return {
    id: toStringValue(row?.id),
    ownerId: toStringValue(row?.owner_id),
    displayName: toStringValue(row?.display_name),
    businessName: toStringValue(row?.business_name),
    type: toStringValue(row?.type) || 'McKenzie Friend',
    headline: toStringValue(row?.headline),
    bio: toStringValue(row?.bio),
    phone: toStringValue(row?.phone),
    email: toStringValue(row?.email),
    website: toStringValue(row?.website),
    city: toStringValue(row?.city),
    postcode: toStringValue(row?.postcode),
    experienceYears: toNumberOrNull(row?.experience_years),
    startingPrice: toNumberOrNull(row?.starting_price),
    responseTime: toStringValue(row?.response_time) || 'Within 24 hours',
    profileImageUrl: toStringValue(row?.profile_image_url),
    coverImageUrl: toStringValue(row?.cover_image_url),
    areasOfLaw: toStringArray(row?.areas_of_law),
    languages: toStringArray(row?.languages),
    services: toStringArray(row?.services),
    availability: toAvailability(row?.availability),
    qualifications: toStringValue(row?.qualifications),
    offersVideoConsultations: Boolean(row?.offers_video_consultations),
    instantResponse: Boolean(row?.instant_response),
    visible: Boolean(row?.visible),
    rating: toNumberOrNull(row?.rating),
    reviewCount: Math.max(0, Math.trunc(toNumberOrNull(row?.review_count) ?? 0)),
    createdAt: toStringValue(row?.created_at),
    updatedAt: toStringValue(row?.updated_at),
  }
}

export function profileToDatabasePayload(profile: Partial<ProfessionalProfileInput>) {
  return {
    display_name: toStringValue(profile.displayName).slice(0, 120),
    business_name: toStringValue(profile.businessName).slice(0, 160),
    type: toStringValue(profile.type).slice(0, 80) || 'McKenzie Friend',
    headline: toStringValue(profile.headline).slice(0, 180),
    bio: toStringValue(profile.bio).slice(0, 1200),
    phone: toStringValue(profile.phone).slice(0, 60),
    email: toStringValue(profile.email).slice(0, 180),
    website: toStringValue(profile.website).slice(0, 260),
    city: toStringValue(profile.city).slice(0, 120),
    postcode: toStringValue(profile.postcode).slice(0, 40),
    experience_years: toNumberOrNull(profile.experienceYears),
    starting_price: toNumberOrNull(profile.startingPrice),
    response_time: toStringValue(profile.responseTime).slice(0, 80) || 'Within 24 hours',
    profile_image_url: toStringValue(profile.profileImageUrl).slice(0, 600),
    cover_image_url: toStringValue(profile.coverImageUrl).slice(0, 600),
    areas_of_law: toStringArray(profile.areasOfLaw).slice(0, 20),
    languages: toStringArray(profile.languages).slice(0, 20),
    services: toStringArray(profile.services).slice(0, 16),
    availability: toAvailability(profile.availability),
    qualifications: toStringValue(profile.qualifications).slice(0, 800),
    offers_video_consultations: Boolean(profile.offersVideoConsultations),
    instant_response: Boolean(profile.instantResponse),
    visible: Boolean(profile.visible),
    updated_at: new Date().toISOString(),
  }
}
