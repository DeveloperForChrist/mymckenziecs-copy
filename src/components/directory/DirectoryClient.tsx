'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Briefcase,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Heart,
  MapPin,
  Search,
  Send,
  X,
} from 'lucide-react'
import {
  AREAS_OF_LAW,
  AVAILABILITY_LABELS,
  type ProfessionalProfile,
} from '@/lib/directory/profiles'
import styles from './directory.module.css'
import WorkspaceLoadingState from '@/components/business/WorkspaceLoadingState'

interface Props {
  mode?: 'business' | 'litigant'
  ownId?: string
}

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

function responseTimeLabel(value: string | null | undefined) {
  const text = String(value || '').trim()
  if (!text) return null
  if (/^within\b/i.test(text)) return `Responds ${text.toLowerCase()}`
  return `Responds in ${text}`
}

export default function DirectoryClient({ mode = 'litigant', ownId }: Props) {
  const [profiles, setProfiles] = useState<ProfessionalProfile[]>([])
  const [selected, setSelected] = useState<ProfessionalProfile | null>(null)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [specialization, setSpecialization] = useState('')
  const [location, setLocation] = useState('')
  const [availability, setAvailability] = useState('')
  const [sort, setSort] = useState<'newest' | 'rating' | 'price_low' | 'price_high'>('newest')
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(true)
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [portalModalOpen, setPortalModalOpen] = useState(false)
  const [selectedForContact, setSelectedForContact] = useState<ProfessionalProfile | null>(null)
  const [contactFormData, setContactFormData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    details: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadProfiles() {
      setLoading(true)
      setLoadError(null)
      try {
        const res = await fetch('/api/directory/professionals', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(typeof data?.message === 'string' ? data.message : 'Unable to load directory.')
        }

        const remoteProfiles = Array.isArray(data?.professionals) ? data.professionals as ProfessionalProfile[] : []

        if (!cancelled) {
          setProfiles(remoteProfiles)
          setSelected(remoteProfiles[0] ?? null)
        }
      } catch {
        if (!cancelled) {
          setProfiles([])
          setSelected(null)
          setLoadError('Unable to load the directory right now. Please try again shortly.')
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

    const filteredProfiles = profiles.filter((profile) => {
      if (!profile.visible) return false
      if (ownId && profile.ownerId === ownId) return false
      if (role && profile.type !== role) return false
      if (specialization && !profile.areasOfLaw.includes(specialization)) return false
      if (location && String(profile.city || '').trim() !== location) return false
      if (availability && profile.availability !== availability) return false

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

    const sorted = [...filteredProfiles]
    sorted.sort((a, b) => {
      if (sort === 'rating') return (b.rating ?? 0) - (a.rating ?? 0)
      if (sort === 'price_low') return (a.startingPrice ?? Number.POSITIVE_INFINITY) - (b.startingPrice ?? Number.POSITIVE_INFINITY)
      if (sort === 'price_high') return (b.startingPrice ?? -1) - (a.startingPrice ?? -1)
      return 0
    })
    return sorted
  }, [availability, location, ownId, profiles, role, search, sort, specialization])

  const roleOptions = useMemo(() => {
    const options = new Set<string>()
    profiles.forEach((profile) => {
      if (profile.visible && profile.type) options.add(profile.type)
    })
    return Array.from(options).sort((a, b) => a.localeCompare(b))
  }, [profiles])

  const locationOptions = useMemo(() => {
    const options = new Set<string>()
    profiles.forEach((profile) => {
      const city = String(profile.city || '').trim()
      if (profile.visible && city) options.add(city)
    })
    return Array.from(options).sort((a, b) => a.localeCompare(b))
  }, [profiles])

  useEffect(() => {
    if (!filtered.length) {
      setSelected(null)
      setProfileModalOpen(false)
      return
    }
    if (selected && !filtered.some((profile) => profile.id === selected.id)) {
      setSelected(filtered[0])
    }
  }, [filtered, selected])

  const openProfile = (profile: ProfessionalProfile) => {
    setSelected(profile)
    setProfileModalOpen(true)
  }

  const openContactModal = (profile: ProfessionalProfile) => {
    setSelectedForContact(profile)
    setContactModalOpen(true)
  }

  const openPortalModal = (profile?: ProfessionalProfile | null) => {
    setSelectedForContact(profile ?? null)
    setPortalModalOpen(true)
  }

  const closeModals = () => {
    setContactModalOpen(false)
    setPortalModalOpen(false)
    setSelectedForContact(null)
    setContactFormData({
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      details: '',
    })
    setSubmitStatus('idle')
    setErrorMessage('')
  }

  useEffect(() => {
    if (!profileModalOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileModalOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [profileModalOpen])

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
      const traceId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `lead-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
      const endpoint = portalModalOpen ? '/api/public/contact-lead' : '/api/public/direct-contact'
      const body = portalModalOpen 
        ? { ...contactFormData, leadTraceId: traceId }
        : { ...contactFormData, professionalId: selectedForContact?.ownerId, leadTraceId: traceId }

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
  const hasActiveFilters = Boolean(search.trim() || role || specialization || location || availability)

  return (
    <div className={`${styles.page} ${mode === 'business' ? styles.pageBusiness : ''}`}>
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>Professional Directory</h1>
        <p className={styles.pageSubtitle}>
          {mode === 'business'
            ? 'Preview how your directory listing is presented to visitors.'
            : 'Browse McKenzie Friends and legal support professionals, and review their services before making contact.'}
        </p>

        <div className={styles.filterCard}>
          <div className={styles.searchWrap}>
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, area of law, service, or location…"
            />
          </div>

          <div className={styles.selectRow}>
            <div className={styles.selectWrap}>
              <select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Role filter">
                <option value="">All roles</option>
                {roleOptions.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <ChevronDown size={15} />
            </div>

            <div className={styles.selectWrap}>
              <select
                value={specialization}
                onChange={(event) => setSpecialization(event.target.value)}
                aria-label="Specialization filter"
              >
                <option value="">All practice areas</option>
                {AREAS_OF_LAW.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <ChevronDown size={15} />
            </div>

            <div className={styles.selectWrap}>
              <select
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                aria-label="Location filter"
              >
                <option value="">All locations</option>
                {locationOptions.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <ChevronDown size={15} />
            </div>

            <div className={styles.selectWrap}>
              <select
                value={availability}
                onChange={(event) => setAvailability(event.target.value)}
                aria-label="Availability filter"
              >
                <option value="">All</option>
                <option value="remote">Remote</option>
                <option value="in-person">In person</option>
                <option value="both">In person & remote</option>
              </select>
              <ChevronDown size={15} />
            </div>

            <div className={styles.selectWrap}>
              <select
                value={sort}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === 'newest' || value === 'rating' || value === 'price_low' || value === 'price_high') {
                    setSort(value)
                  }
                }}
                aria-label="Sort order"
              >
                <option value="newest">Newest First</option>
                <option value="rating">Highest Rated</option>
                <option value="price_low">Lowest Rate</option>
                <option value="price_high">Highest Rate</option>
              </select>
              <ChevronDown size={15} />
            </div>
          </div>
        </div>

        {mode !== 'business' ? (
          <div className={styles.portalCallout}>
            <div>
              <strong>Not sure who to instruct?</strong>
              <span>
                Submit an enquiry to the MCS Portal and we will circulate it to legal support professionals in the directory for review.
              </span>
              <span>
                If a professional accepts your enquiry, they can send you a client portal invite. You will receive it in your Inbox and continue from there.
              </span>
            </div>
            <button type="button" className={styles.portalCalloutBtn} onClick={() => openPortalModal()}>
              Submit an enquiry
            </button>
          </div>
        ) : (
          <div className={styles.businessCallout}>
            <div>
              <strong>Public directory preview</strong>
              <span>Use “My Profile” to update your listing details, pricing, and availability.</span>
            </div>
          </div>
        )}

        <div className={styles.resultMeta}>
          <span>Showing <strong>{filtered.length}</strong> professional{filtered.length === 1 ? '' : 's'}</span>
          {loading && <WorkspaceLoadingState variant="inline" label="Loading live directory..." />}
          {!loading && loadError && <span>{loadError}</span>}
        </div>
      </header>

      <div className={styles.marketBody}>
        <div className={styles.catalog}>
          {filtered.length === 0 ? (
            <div className={styles.emptyState}>
              <Briefcase size={34} />
              {loadError ? (
                <p>{loadError}</p>
              ) : hasActiveFilters ? (
                <p>No professionals match those filters.</p>
              ) : (
                <p>No professionals are published in the directory yet.</p>
              )}
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

                  <div className={styles.cardBody}>
                    <div className={styles.identityRow}>
                      <div className={styles.avatarLarge}>
                        {profile.profileImageUrl ? <img src={profile.profileImageUrl} alt="" /> : initials(profile.displayName)}
                      </div>
                      <div className={styles.identityCopy}>
                        <h2>{profile.displayName || 'Directory professional'}</h2>
                        <p>{profile.type}</p>
                      </div>
                    </div>

                    {responseTimeLabel(profile.responseTime) && (
                      <div className={styles.responsePill}>
                        <Clock3 size={14} />
                        {responseTimeLabel(profile.responseTime)}
                      </div>
                    )}

                    <div className={styles.infoList}>
                      <span><MapPin size={14} /> {[profile.city, profile.postcode].filter(Boolean).join(' / ') || 'United Kingdom'}</span>
                      {profile.experienceYears !== null && <span><Clock3 size={14} /> {profile.experienceYears} years experience</span>}
                    </div>

                    {profile.bio && <p className={styles.cardSummary}>{profile.bio}</p>}

                    <div className={styles.cardTags}>
                      <div className={styles.tagHeading}>Practice areas</div>
                      <div className={styles.tagRow}>
                        {profile.areasOfLaw.slice(0, 4).map((item) => (
                          <span key={item}>{item}</span>
                        ))}
                        {profile.areasOfLaw.length > 4 && <span className={styles.tagMore}>+{profile.areasOfLaw.length - 4} more</span>}
                      </div>
                    </div>

                    <div className={styles.rateBox}>
                      <span>Indicative rate</span>
                      <strong>{profile.startingPrice !== null ? `£${profile.startingPrice}` : 'Quote'}</strong>
                    </div>

                    <button type="button" className={styles.fullProfileBtn} onClick={() => openProfile(profile)}>
                      View full profile
                    </button>
                  </div>
                </article>
              )
            })
          )}
        </div>
      </div>

      {selected && profileModalOpen && (
        <div
          className={styles.profileOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Professional profile"
          onClick={(event) => {
            if (event.target === event.currentTarget) setProfileModalOpen(false)
          }}
        >
          <div className={styles.profileModal}>
            <div className={styles.profileTopBar}>
              <button
                type="button"
                className={styles.profileClose}
                onClick={() => setProfileModalOpen(false)}
                aria-label="Close profile"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.profileBody}>
              <section className={styles.profileHeroCard}>
                <div className={styles.profileHeroLeft}>
                  <div className={styles.profileHeroAvatar}>
                    {selected.profileImageUrl ? <img src={selected.profileImageUrl} alt="" /> : initials(selected.displayName)}
                  </div>
                  <div className={styles.profileHeroName}>
                    <h2>{selected.displayName || 'Directory professional'}</h2>
                    <p>{selected.type}</p>
                  </div>
                </div>

                <div className={styles.profileHeroGrid}>
                  <div className={styles.profileHeroStat}>
                    <span>Location</span>
                    <strong><MapPin size={14} /> {[selected.city, selected.postcode].filter(Boolean).join(' / ') || 'United Kingdom'}</strong>
                  </div>
                  <div className={styles.profileHeroStat}>
                    <span>Experience</span>
                    <strong><Clock3 size={14} /> {selected.experienceYears !== null ? `${selected.experienceYears} years` : 'Not listed'}</strong>
                  </div>
                  <div className={styles.profileHeroStat}>
                    <span>Availability</span>
                    <strong><CheckCircle2 size={14} /> {selected.instantResponse ? 'Available Now' : AVAILABILITY_LABELS[selected.availability]}</strong>
                  </div>
                  <div className={styles.profileHeroStat}>
                    <span>Hourly Rate</span>
                    <strong>{selected.startingPrice !== null ? `£${selected.startingPrice}` : 'Quote'}</strong>
                  </div>
                </div>

                <div className={styles.profileHeroChips}>
                  <span className={styles.profileHeroChipsLabel}>Specializations</span>
                  <div className={styles.profileHeroChipRow}>
                    {selected.areasOfLaw.map((item) => (
                      <span key={item} className={styles.profileHeroChip}>{item}</span>
                    ))}
                  </div>
                </div>

                <div className={styles.profileHeroActions}>
                  <button
                    type="button"
                    className={styles.profileActionPrimary}
                    onClick={() => {
                      setProfileModalOpen(false)
                      openContactModal(selected)
                    }}
                  >
                    Request consultation
                  </button>
                </div>
              </section>

              <section className={styles.profileAboutCard}>
                <div className={styles.profileAboutHeader}>
                  <strong>About Me</strong>
                </div>
                <div className={styles.profileAboutText}>
                  {selected.bio || 'This professional has not added a full profile yet.'}
                </div>
                <div className={styles.profileAboutFooter}>
                  <div>
                    <span>Service Areas</span>
                    <strong>{[selected.city, selected.postcode].filter(Boolean).join(', ') || 'England and Wales'}</strong>
                  </div>
                  <div>
                    <span>Indicative rate</span>
                    <strong>{selected.startingPrice !== null ? `£${selected.startingPrice}` : 'Quote'}</strong>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Contact/Portal Modal */}
      {(contactModalOpen || portalModalOpen) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {portalModalOpen ? 'Submit to the MCS Portal' : `Contact ${selectedForContact?.displayName}`}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {portalModalOpen 
                    ? 'Your enquiry will be shared with legal support professionals in the directory. If one accepts, they can send a client portal invite to your Inbox. We aim for a response within 24–48 hours (subject to availability).'
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
                    ? 'Your enquiry has been submitted. If a professional accepts, they can send you a client portal invite that appears in your Inbox.'
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
                    Summary of your enquiry *
                    </label>
                    <textarea
                      id="details"
                      name="details"
                      required
                      rows={4}
                      value={contactFormData.details}
                      onChange={handleContactFormChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                    placeholder="Briefly describe the issue and what support you are seeking…"
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
                      {portalModalOpen ? 'Submit enquiry' : 'Send message'}
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
