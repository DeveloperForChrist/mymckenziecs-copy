'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Briefcase,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Heart,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Search,
  Star,
  Video,
  X,
} from 'lucide-react'
import {
  AREAS_OF_LAW,
  AVAILABILITY_LABELS,
  EMPTY_PROFESSIONAL_PROFILE,
  SERVICE_OPTIONS,
  type DirectoryAvailability,
  type ProfessionalProfile,
} from '@/lib/directory/profiles'
import styles from './directory.module.css'

interface Props {
  mode?: 'business' | 'litigant'
  ownId?: string
}

const FEATURED_PROFILES: ProfessionalProfile[] = [
  {
    ...EMPTY_PROFESSIONAL_PROFILE,
    id: 'demo-sarah',
    ownerId: 'demo-sarah',
    displayName: 'Sarah McKenzie',
    businessName: 'McKenzieCS Legal Support',
    type: 'McKenzie Friend',
    headline: 'I will help you prepare your small claim, bundle, and hearing notes',
    bio: 'Experienced McKenzie Friend supporting litigants in housing, employment, and small claims. I help turn scattered papers into a calm hearing plan.',
    city: 'London',
    postcode: 'SE1',
    phone: '07700 900001',
    email: 'sarah@mymckenziecs.com',
    website: 'https://mymckenziecs.com',
    experienceYears: 7,
    startingPrice: 85,
    responseTime: 'Within 12 hours',
    areasOfLaw: ['Housing & Disrepair', 'Employment', 'Small Claims', 'Court Bundles'],
    languages: ['English'],
    services: ['Court hearing support', 'Bundle preparation', 'Case strategy session'],
    availability: 'both',
    qualifications: 'LLB Law, NFMF member, professional indemnity insured',
    offersVideoConsultations: true,
    instantResponse: true,
    visible: true,
    rating: 4.9,
    reviewCount: 82,
  },
  {
    ...EMPTY_PROFESSIONAL_PROFILE,
    id: 'demo-james',
    ownerId: 'demo-james',
    displayName: 'James Williams',
    businessName: 'Williams Legal Consulting',
    type: 'Legal Consultant',
    headline: 'I will draft employment tribunal documents and organise your evidence',
    bio: 'Former paralegal with experience in employment and civil litigation. I assist with case preparation, statements, chronology, and settlement documents.',
    city: 'Birmingham',
    postcode: 'B1',
    email: 'james.w@williamslegal.co.uk',
    experienceYears: 5,
    startingPrice: 70,
    responseTime: 'Within 24 hours',
    areasOfLaw: ['Employment', 'Civil Litigation', 'Small Claims', 'Consumer Rights'],
    languages: ['English', 'French'],
    services: ['Document drafting', 'Settlement preparation', 'Remote consultation'],
    availability: 'both',
    qualifications: 'CILEX Level 6, employment law specialist',
    offersVideoConsultations: true,
    instantResponse: false,
    visible: true,
    rating: 5,
    reviewCount: 52,
  },
  {
    ...EMPTY_PROFESSIONAL_PROFILE,
    id: 'demo-amara',
    ownerId: 'demo-amara',
    displayName: 'Amara Osei',
    businessName: '',
    type: 'Paralegal',
    headline: 'I will help organise family court papers and hearing preparation',
    bio: 'Paralegal focused on family and immigration matters. Available for remote support across England and Wales.',
    city: 'Manchester',
    postcode: 'M1',
    email: 'amara.osei@legalaid.co.uk',
    experienceYears: 3,
    startingPrice: 60,
    responseTime: 'Within 48 hours',
    areasOfLaw: ['Family & Children', 'Immigration', 'Witness Statements'],
    languages: ['English', 'Twi', 'French'],
    services: ['Form completion', 'Document drafting', 'Remote consultation'],
    availability: 'remote',
    qualifications: 'Law Society paralegal certificate',
    offersVideoConsultations: true,
    instantResponse: false,
    visible: true,
    rating: 4.8,
    reviewCount: 29,
  },
  {
    ...EMPTY_PROFESSIONAL_PROFILE,
    id: 'demo-daniel',
    ownerId: 'demo-daniel',
    displayName: 'Daniel Price',
    businessName: 'Price McKenzie Associates',
    type: 'McKenzie Friend',
    headline: 'I will support complex civil litigation hearings and documents',
    bio: 'Retired solicitor now working as a McKenzie Friend. I provide detailed hearing support and document drafting for civil and commercial disputes.',
    city: 'Bristol',
    postcode: 'BS1',
    phone: '07700 900004',
    email: 'daniel@pricemckenzie.co.uk',
    website: 'https://pricemckenzie.co.uk',
    experienceYears: 20,
    startingPrice: 125,
    responseTime: 'Within 24 hours',
    areasOfLaw: ['Civil Litigation', 'Small Claims', 'Landlord & Tenant', 'Consumer Rights'],
    languages: ['English', 'Welsh'],
    services: ['Court hearing support', 'Document drafting', 'Case strategy session'],
    availability: 'in-person',
    qualifications: 'Retired solicitor, LLB, LPC',
    offersVideoConsultations: false,
    instantResponse: false,
    visible: true,
    rating: 4.9,
    reviewCount: 113,
  },
]

function initials(name: string) {
  return name
    .split(' ')
    .map((word) => word[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'MC'
}

function formatPrice(value: number | null) {
  return typeof value === 'number' ? `From £${value}` : 'Quote on request'
}

function ratingLabel(profile: ProfessionalProfile) {
  if (typeof profile.rating !== 'number' || profile.reviewCount <= 0) return null
  return { score: profile.rating.toFixed(1), count: profile.reviewCount > 999 ? '1k+' : String(profile.reviewCount) }
}

function levelBadge(profile: ProfessionalProfile): { label: string; cls: 'badge' | 'badgeTop' | 'badgeVideo' } | null {
  if (profile.reviewCount >= 80) return { label: 'Top Rated ✦', cls: 'badgeTop' }
  if (profile.reviewCount >= 30) return { label: 'Level 2 ✦✦', cls: 'badge' }
  if (profile.reviewCount >= 10) return { label: 'Level 1', cls: 'badge' }
  if (profile.instantResponse) return { label: 'Fast reply', cls: 'badgeVideo' }
  return null
}

export default function DirectoryClient({ mode = 'litigant', ownId }: Props) {
  const [profiles, setProfiles] = useState<ProfessionalProfile[]>(FEATURED_PROFILES)
  const [selected, setSelected] = useState<ProfessionalProfile | null>(FEATURED_PROFILES[0])
  const [detailOpen, setDetailOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [area, setArea] = useState('')
  const [service, setService] = useState('')
  const [budget, setBudget] = useState('')
  const [availability, setAvailability] = useState('')
  const [videoOnly, setVideoOnly] = useState(false)
  const [instantOnly, setInstantOnly] = useState(false)
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(true)
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [portalModalOpen, setPortalModalOpen] = useState(false)
  const [selectedForContact, setSelectedForContact] = useState<ProfessionalProfile | null>(null)
  const [contactFormData, setContactFormData] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    phone: '',
    email: '',
    details: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadProfiles() {
      setLoading(true)
      try {
        const res = await fetch('/api/directory/professionals', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        const remoteProfiles = Array.isArray(data?.professionals) ? data.professionals as ProfessionalProfile[] : []

        if (!cancelled && remoteProfiles.length > 0) {
          setProfiles(remoteProfiles)
          setSelected(remoteProfiles[0])
        }
      } catch {
        if (!cancelled) {
          setProfiles(FEATURED_PROFILES)
          setSelected(FEATURED_PROFILES[0])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadProfiles()
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const maxBudget = budget ? Number(budget) : null

    return profiles.filter((profile) => {
      if (!profile.visible) return false
      if (ownId && profile.ownerId === ownId) return false
      if (area && !profile.areasOfLaw.includes(area)) return false
      if (service && !profile.services.includes(service)) return false
      if (availability && profile.availability !== availability) return false
      if (videoOnly && !profile.offersVideoConsultations) return false
      if (instantOnly && !profile.instantResponse) return false
      if (maxBudget !== null && profile.startingPrice !== null && profile.startingPrice > maxBudget) return false

      if (!q) return true
      const haystack = [
        profile.displayName,
        profile.businessName,
        profile.type,
        profile.headline,
        profile.bio,
        profile.city,
        ...profile.areasOfLaw,
        ...profile.services,
      ].join(' ').toLowerCase()

      return haystack.includes(q)
    })
  }, [area, availability, budget, instantOnly, ownId, profiles, search, service, videoOnly])

  useEffect(() => {
    if (!filtered.length) {
      setSelected(null)
      return
    }
    if (selected && !filtered.some((profile) => profile.id === selected.id)) {
      setSelected(filtered[0])
    }
  }, [filtered, selected])

  const openProfile = (profile: ProfessionalProfile) => {
    setSelected(profile)
    setDetailOpen(true)
  }

  const openContactModal = (profile: ProfessionalProfile) => {
    setSelectedForContact(profile)
    setContactModalOpen(true)
  }

  const openPortalModal = (profile: ProfessionalProfile) => {
    setSelectedForContact(profile)
    setPortalModalOpen(true)
  }

  const closeModals = () => {
    setContactModalOpen(false)
    setPortalModalOpen(false)
    setSelectedForContact(null)
    setContactFormData({
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      phone: '',
      email: '',
      details: '',
    })
    setSubmitStatus('idle')
    setErrorMessage('')
  }

  const handleContactFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setContactFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitStatus('idle')
    setErrorMessage('')

    try {
      const endpoint = portalModalOpen ? '/api/public/contact-lead' : '/api/public/direct-contact'
      const body = portalModalOpen 
        ? contactFormData
        : { ...contactFormData, professionalId: selectedForContact?.ownerId }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to submit form')
      }

      setSubmitStatus('success')
      setTimeout(closeModals, 2000)
    } catch (error) {
      setSubmitStatus('error')
      setErrorMessage(error instanceof Error ? error.message : 'An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleFavorite = (id: string) => {
    setFavorites((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const hasRemoteProfiles = profiles !== FEATURED_PROFILES

  return (
    <div className={styles.page}>
      <div className={styles.marketHeader}>
        <div className={styles.titleBlock}>
          <span className={styles.eyebrow}>McKenzie Directory</span>
          <h1>Find legal support professionals</h1>
          <p>
            {mode === 'business'
              ? 'Browse how professional listings appear to litigants.'
              : 'Compare McKenzie Friends, paralegals, and legal consultants before you contact them.'}
          </p>
        </div>

        <div className={styles.searchWrap}>
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by issue, service, name, or city"
          />
        </div>
      </div>

      <div className={styles.filterBar}>
        <label className={styles.filterButton}>
          <span>Service options</span>
          <select value={service} onChange={(event) => setService(event.target.value)}>
            <option value="">Any service</option>
            {SERVICE_OPTIONS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <ChevronDown size={15} />
        </label>

        <label className={styles.filterButton}>
          <span>Legal area</span>
          <select value={area} onChange={(event) => setArea(event.target.value)}>
            <option value="">All areas</option>
            {AREAS_OF_LAW.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <ChevronDown size={15} />
        </label>

        <label className={styles.filterButton}>
          <span>Budget</span>
          <select value={budget} onChange={(event) => setBudget(event.target.value)}>
            <option value="">Any budget</option>
            <option value="50">Up to £50</option>
            <option value="100">Up to £100</option>
            <option value="200">Up to £200</option>
          </select>
          <ChevronDown size={15} />
        </label>

        <label className={styles.filterButton}>
          <span>Availability</span>
          <select value={availability} onChange={(event) => setAvailability(event.target.value)}>
            <option value="">Any availability</option>
            <option value="remote">Remote</option>
            <option value="in-person">In person</option>
            <option value="both">In person & remote</option>
          </select>
          <ChevronDown size={15} />
        </label>

        <div className={styles.toggleGroup}>
          <button
            type="button"
            className={`${styles.pillToggle} ${videoOnly ? styles.pillToggleOn : ''}`}
            onClick={() => setVideoOnly((value) => !value)}
          >
            <Video size={15} /> Video consults
          </button>
          <button
            type="button"
            className={`${styles.pillToggle} ${instantOnly ? styles.pillToggleOn : ''}`}
            onClick={() => setInstantOnly((value) => !value)}
          >
            <MessageSquare size={15} /> Instant response
          </button>
        </div>
      </div>

      <div className={styles.resultMeta}>
        <span>{filtered.length} professional{filtered.length === 1 ? '' : 's'} available</span>
        {loading && <span>Loading live directory...</span>}
        {!loading && !hasRemoteProfiles && <span>Showing sample listings until professionals publish profiles</span>}
      </div>

      <div className={styles.marketBody}>
        <div className={styles.catalog}>
          {filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <Briefcase size={34} />
              <p>No professionals match those filters.</p>
            </div>
          ) : (
            filtered.map((profile) => {
              const active = selected?.id === profile.id
              const favorite = favorites.has(profile.id)

              return (
                <article
                  key={profile.id}
                  className={`${styles.proCard} ${active ? styles.proCardActive : ''}`}
                >
                  <button
                    type="button"
                    className={`${styles.favoriteButton} ${favorite ? styles.favoriteButtonOn : ''}`}
                    onClick={() => toggleFavorite(profile.id)}
                    aria-label={favorite ? 'Remove from saved professionals' : 'Save professional'}
                  >
                    <Heart size={20} fill={favorite ? 'currentColor' : 'none'} />
                  </button>

                  <button type="button" className={styles.mediaButton} onClick={() => openProfile(profile)}>
                    {profile.coverImageUrl ? (
                      <img src={profile.coverImageUrl} alt="" className={styles.coverImage} />
                    ) : (
                      <div className={styles.mediaFallback}>
                        <span>{profile.type}</span>
                        <strong>{profile.areasOfLaw[0] || 'Legal support'}</strong>
                        <small>{AVAILABILITY_LABELS[profile.availability as DirectoryAvailability]}</small>
                      </div>
                    )}
                  </button>

                  <div className={styles.cardBody}>
                    <div className={styles.sellerLine}>
                      <div className={styles.avatar}>
                        {profile.profileImageUrl ? <img src={profile.profileImageUrl} alt="" /> : initials(profile.displayName)}
                      </div>
                      <div className={styles.sellerCopy}>
                        <span>{profile.displayName || 'Directory professional'}</span>
                        <small>{profile.businessName || profile.type}</small>
                      </div>
                      {(() => { const lb = levelBadge(profile); return lb ? <span className={styles[lb.cls]}>{lb.label}</span> : null })()}
                    </div>

                    <button type="button" className={styles.cardTitle} onClick={() => openProfile(profile)}>
                      {profile.headline || `I can help with ${profile.areasOfLaw[0] || 'case preparation'}`}
                    </button>

                    <div className={styles.ratingLine}>
                      {(() => { const r = ratingLabel(profile); return r ? (<><Star size={14} fill="currentColor" /><strong>{r.score}</strong><span>({r.count})</span></>) : (<><Star size={14} fill="currentColor" /><strong>New</strong></>); })()}
                      {profile.experienceYears !== null && <span>{profile.experienceYears} yrs exp.</span>}
                    </div>

                    <div className={styles.cardInfoGrid}>
                      <span><MapPin size={13} /> {[profile.city, profile.postcode].filter(Boolean).join(', ') || 'Remote'}</span>
                      <span><Clock3 size={13} /> {profile.responseTime}</span>
                      <span><CheckCircle2 size={13} /> {AVAILABILITY_LABELS[profile.availability]}</span>
                    </div>

                    {profile.bio && <p className={styles.cardSummary}>{profile.bio}</p>}

                    <div className={styles.cardTags}>
                      {profile.areasOfLaw.slice(0, 3).map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>

                    <div className={styles.serviceTags}>
                      {(profile.services.length ? profile.services : ['Case preparation']).slice(0, 3).map((item) => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>

                    <div className={styles.cardFooter}>
                      <div>
                        <strong>{formatPrice(profile.startingPrice)}</strong>
                        {profile.offersVideoConsultations && (
                          <span><Video size={12} /> Video consultations</span>
                        )}
                      </div>
                      <div className={styles.cardActions}>
                        <button 
                          type="button" 
                          className={styles.contactBtn}
                          onClick={() => openContactModal(profile)}
                        >
                          <Mail size={14} /> Contact
                        </button>
                        <button type="button" className={styles.viewBtn} onClick={() => openProfile(profile)}>View profile</button>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })
          )}
        </div>

        {selected && (
          <aside className={`${styles.detailPanel} ${detailOpen ? styles.detailPanelOpen : ''}`} aria-label="Professional details">
            <button
              type="button"
              className={styles.closeDetail}
              onClick={() => {
                setDetailOpen(false)
                setSelected(null)
              }}
              aria-label="Close details"
            >
              <X size={18} />
            </button>

            <div className={styles.detailMedia}>
              {selected.coverImageUrl ? (
                <img src={selected.coverImageUrl} alt="" />
              ) : (
                <div className={styles.detailFallback}>
                  <span>{selected.type}</span>
                  <strong>{selected.headline || selected.displayName}</strong>
                </div>
              )}
            </div>

            <div className={styles.detailContent}>
              <div className={styles.detailIdentity}>
                <div className={styles.detailAvatar}>
                  {selected.profileImageUrl ? <img src={selected.profileImageUrl} alt="" /> : initials(selected.displayName)}
                </div>
                <div>
                  <h2>{selected.displayName || 'Directory professional'}</h2>
                  <p>{selected.businessName || selected.type}</p>
                  <span><MapPin size={13} /> {[selected.city, selected.postcode].filter(Boolean).join(', ') || 'Remote'}</span>
                </div>
              </div>

              <div className={styles.detailStats}>
                <span><Star size={15} fill="currentColor" style={{color:'#f59e0b'}} /> {(() => { const r = ratingLabel(selected); return r ? `${r.score} (${r.count})` : 'New' })()}</span>
                <span><Clock3 size={15} /> {selected.responseTime}</span>
                <span><CheckCircle2 size={15} /> {AVAILABILITY_LABELS[selected.availability]}</span>
              </div>

              <section className={styles.detailSection}>
                <h3>{selected.headline || 'Professional support'}</h3>
                <p>{selected.bio || 'This professional has not added a full profile yet.'}</p>
              </section>

              <section className={styles.detailSection}>
                <h3>Services</h3>
                <div className={styles.detailTags}>
                  {(selected.services.length ? selected.services : ['Case preparation']).map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </section>

              <section className={styles.detailSection}>
                <h3>Areas of law</h3>
                <div className={styles.detailTags}>
                  {selected.areasOfLaw.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </section>

              <section className={styles.detailSection}>
                <h3>Qualifications</h3>
                <p>{selected.qualifications || 'Not provided yet.'}</p>
              </section>

              <section className={styles.detailSection}>
                <h3>Languages</h3>
                <div className={styles.detailTags}>
                  {selected.languages.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </section>

              <div className={styles.contactStack}>
                {selected.email && <a href={`mailto:${selected.email}`}><Mail size={16} /> Contact by email</a>}
                {selected.phone && <a href={`tel:${selected.phone}`}><Phone size={16} /> {selected.phone}</a>}
                {selected.website && <a href={selected.website} target="_blank" rel="noreferrer">Visit website</a>}
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Contact/Portal Modal */}
      {(contactModalOpen || portalModalOpen) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {portalModalOpen ? 'Send to MCS Portal' : `Contact ${selectedForContact?.displayName}`}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {portalModalOpen 
                    ? 'Your enquiry will be sent to all legal professionals in the directory.'
                    : `Send a private message to ${selectedForContact?.displayName}`}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModals}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            {submitStatus === 'success' ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="text-green-600" size={24} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Message Sent!</h3>
                <p className="text-gray-600 text-sm">
                  {portalModalOpen 
                    ? 'Your enquiry has been sent to the MCS portal. Legal professionals will review your case.'
                    : 'Your message has been sent to the professional.'}
                </p>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      id="firstName"
                      name="firstName"
                      required
                      value={contactFormData.firstName}
                      onChange={handleContactFormChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      id="lastName"
                      name="lastName"
                      required
                      value={contactFormData.lastName}
                      onChange={handleContactFormChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="Doe"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700 mb-1">
                    Date of Birth *
                  </label>
                  <input
                    type="date"
                    id="dateOfBirth"
                    name="dateOfBirth"
                    required
                    value={contactFormData.dateOfBirth}
                    onChange={handleContactFormChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    required
                    value={contactFormData.phone}
                    onChange={handleContactFormChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="07700 900000"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    value={contactFormData.email}
                    onChange={handleContactFormChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="john@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="details" className="block text-sm font-medium text-gray-700 mb-1">
                    Details of Your Issue *
                  </label>
                  <textarea
                    id="details"
                    name="details"
                    required
                    rows={4}
                    value={contactFormData.details}
                    onChange={handleContactFormChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                    placeholder="Please describe your legal issue in detail..."
                  />
                </div>

                {submitStatus === 'error' && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                    {errorMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      {portalModalOpen ? 'Send to MCS Portal' : 'Send Message'}
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
