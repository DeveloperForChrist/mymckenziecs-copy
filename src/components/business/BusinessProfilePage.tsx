'use client'

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock3,
  Eye,
  Image as ImageIcon,
  Save,
  Star,
  Upload,
  Video,
  Zap,
} from 'lucide-react'
import {
  AREAS_OF_LAW,
  EMPTY_PROFESSIONAL_PROFILE,
  LANGUAGES,
  PROFESSIONAL_TYPES,
  SERVICE_OPTIONS,
  type ProfessionalProfile,
} from '@/lib/directory/profiles'
import styles from './profile.module.css'

const DEFAULT_PROFILE: ProfessionalProfile = {
  ...EMPTY_PROFESSIONAL_PROFILE,
  id: '',
  ownerId: '',
  rating: null,
  reviewCount: 0,
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

export default function BusinessProfilePage() {
  const [profile, setProfile] = useState<ProfessionalProfile>(DEFAULT_PROFILE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<'profile' | 'cover' | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadProfile() {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch('/api/business/profile', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))

        if (!res.ok) {
          throw new Error(typeof data?.message === 'string' ? data.message : 'Unable to load profile.')
        }

        if (!cancelled && data?.profile) {
          setProfile({ ...DEFAULT_PROFILE, ...data.profile })
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load profile.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadProfile()
    return () => {
      cancelled = true
    }
  }, [])

  const update = useCallback(<K extends keyof ProfessionalProfile>(key: K, value: ProfessionalProfile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }))
  }, [])

  const toggleArrayValue = useCallback((key: 'areasOfLaw' | 'languages' | 'services', value: string) => {
    setProfile((current) => {
      const existing = current[key]
      return {
        ...current,
        [key]: existing.includes(value)
          ? existing.filter((item) => item !== value)
          : [...existing, value],
      }
    })
  }, [])

  const publishChecks = useMemo(() => {
    const missing = []
    if (!profile.displayName.trim()) missing.push('display name')
    if (!profile.headline.trim()) missing.push('listing title')
    if (!profile.email.trim()) missing.push('contact email')
    if (!profile.city.trim()) missing.push('city')
    if (profile.areasOfLaw.length === 0) missing.push('at least one legal area')
    return missing
  }, [profile.areasOfLaw.length, profile.city, profile.displayName, profile.email, profile.headline])

  const canPublish = publishChecks.length === 0

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setStatus(null)
    setError(null)

    if (profile.visible && !canPublish) {
      setSaving(false)
      setError(`Complete ${publishChecks.join(', ')} before publishing to the directory.`)
      return
    }

    try {
      const res = await fetch('/api/business/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(typeof data?.message === 'string' ? data.message : 'Unable to save profile.')
      }

      setProfile({ ...DEFAULT_PROFILE, ...data.profile })
      setStatus(profile.visible ? 'Profile saved and published to the directory.' : 'Profile saved as hidden.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save profile.')
    } finally {
      setSaving(false)
    }
  }

  const uploadImage = async (kind: 'profile' | 'cover', event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploading(kind)
    setStatus(null)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('kind', kind)
      formData.append('file', file)

      const res = await fetch('/api/business/profile/images', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(typeof data?.message === 'string' ? data.message : 'Image upload failed.')
      }

      update(kind === 'cover' ? 'coverImageUrl' : 'profileImageUrl', data.url || '')
      setStatus(kind === 'cover' ? 'Listing cover uploaded.' : 'Profile photo uploaded.')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Image upload failed.')
    } finally {
      setUploading(null)
    }
  }

  return (
    <form className={styles.page} onSubmit={handleSave}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Directory profile</span>
          <h1>Build your McKenzie listing</h1>
          <p>What you save here becomes the marketplace card litigants use to compare and contact you.</p>
        </div>
        <button type="submit" className={styles.saveBtn} disabled={saving || uploading !== null}>
          <Save size={16} /> {saving ? 'Saving...' : 'Save listing'}
        </button>
      </div>

      {status && <div className={styles.notice}><CheckCircle2 size={16} /> {status}</div>}
      {error && <div className={styles.errorNotice}><AlertCircle size={16} /> {error}</div>}

      <div className={styles.body}>
        <div className={styles.editor}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Listing media</h2>
              <span>{loading ? 'Loading...' : 'JPG, PNG, WebP or GIF'}</span>
            </div>

            <div className={styles.mediaGrid}>
              <label className={styles.coverUploader}>
                <input type="file" accept="image/*" onChange={(event) => void uploadImage('cover', event)} />
                {profile.coverImageUrl ? (
                  <img src={profile.coverImageUrl} alt="" />
                ) : (
                  <span className={styles.uploadPlaceholder}><ImageIcon size={28} /> Listing cover</span>
                )}
                <strong><Upload size={15} /> {uploading === 'cover' ? 'Uploading...' : 'Upload cover'}</strong>
              </label>

              <label className={styles.avatarUploader}>
                <input type="file" accept="image/*" onChange={(event) => void uploadImage('profile', event)} />
                <span className={styles.avatarPreview}>
                  {profile.profileImageUrl ? <img src={profile.profileImageUrl} alt="" /> : initials(profile.displayName)}
                </span>
                <strong><Camera size={15} /> {uploading === 'profile' ? 'Uploading...' : 'Upload photo'}</strong>
              </label>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Professional details</h2>
              <span>{canPublish ? 'Ready to publish' : `${publishChecks.length} item${publishChecks.length === 1 ? '' : 's'} needed`}</span>
            </div>

            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Display name</span>
                <input value={profile.displayName} onChange={(event) => update('displayName', event.target.value)} placeholder="Sarah McKenzie" />
              </label>
              <label className={styles.field}>
                <span>Business name</span>
                <input value={profile.businessName} onChange={(event) => update('businessName', event.target.value)} placeholder="McKenzieCS Legal Support" />
              </label>
              <label className={styles.field}>
                <span>Professional type</span>
                <select value={profile.type} onChange={(event) => update('type', event.target.value)}>
                  {PROFESSIONAL_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span>Starting price (GBP)</span>
                <input
                  type="number"
                  min="0"
                  value={profile.startingPrice ?? ''}
                  onChange={(event) => update('startingPrice', event.target.value ? Number(event.target.value) : null)}
                  placeholder="85"
                />
              </label>
            </div>

            <label className={styles.field}>
              <span>Listing title</span>
              <input
                value={profile.headline}
                onChange={(event) => update('headline', event.target.value)}
                maxLength={180}
                placeholder="I will help you prepare your small claim bundle and hearing notes"
              />
            </label>

            <label className={styles.field}>
              <span>About your service</span>
              <textarea
                value={profile.bio}
                onChange={(event) => update('bio', event.target.value)}
                maxLength={1200}
                placeholder="Describe your experience, approach, and the kind of support litigants can expect."
              />
              <small>{profile.bio.length}/1200</small>
            </label>

            <label className={styles.field}>
              <span>Qualifications and accreditations</span>
              <textarea
                className={styles.shortTextarea}
                value={profile.qualifications}
                onChange={(event) => update('qualifications', event.target.value)}
                maxLength={800}
                placeholder="LLB, CILEX, paralegal certificate, memberships, insurance, supervised status..."
              />
            </label>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Contact and availability</h2>
              <span>Shown on full details</span>
            </div>

            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Contact email</span>
                <input type="email" value={profile.email} onChange={(event) => update('email', event.target.value)} placeholder="hello@firm.com" />
              </label>
              <label className={styles.field}>
                <span>Phone</span>
                <input value={profile.phone} onChange={(event) => update('phone', event.target.value)} placeholder="07700 900000" />
              </label>
              <label className={styles.field}>
                <span>Website</span>
                <input value={profile.website} onChange={(event) => update('website', event.target.value)} placeholder="https://" />
              </label>
              <label className={styles.field}>
                <span>Years experience</span>
                <input
                  type="number"
                  min="0"
                  max="80"
                  value={profile.experienceYears ?? ''}
                  onChange={(event) => update('experienceYears', event.target.value ? Number(event.target.value) : null)}
                  placeholder="5"
                />
              </label>
              <label className={styles.field}>
                <span>City or town</span>
                <input value={profile.city} onChange={(event) => update('city', event.target.value)} placeholder="London" />
              </label>
              <label className={styles.field}>
                <span>Postcode</span>
                <input value={profile.postcode} onChange={(event) => update('postcode', event.target.value)} placeholder="SE1" />
              </label>
              <label className={styles.field}>
                <span>Availability</span>
                <select value={profile.availability} onChange={(event) => update('availability', event.target.value as ProfessionalProfile['availability'])}>
                  <option value="both">In person and remote</option>
                  <option value="remote">Remote only</option>
                  <option value="in-person">In person only</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Response time</span>
                <select value={profile.responseTime} onChange={(event) => update('responseTime', event.target.value)}>
                  <option>Within 2 hours</option>
                  <option>Within 12 hours</option>
                  <option>Within 24 hours</option>
                  <option>Within 48 hours</option>
                  <option>By appointment</option>
                </select>
              </label>
            </div>

            <div className={styles.optionRow}>
              <button
                type="button"
                className={`${styles.optionToggle} ${profile.offersVideoConsultations ? styles.optionToggleOn : ''}`}
                onClick={() => update('offersVideoConsultations', !profile.offersVideoConsultations)}
              >
                <Video size={16} /> Video consultations
              </button>
              <button
                type="button"
                className={`${styles.optionToggle} ${profile.instantResponse ? styles.optionToggleOn : ''}`}
                onClick={() => update('instantResponse', !profile.instantResponse)}
              >
                <Zap size={16} /> Instant response
              </button>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Expertise</h2>
              <span>Used by filters</span>
            </div>

            <div className={styles.chipBlock}>
              <h3>Areas of law</h3>
              <div className={styles.chipGrid}>
                {AREAS_OF_LAW.map((area) => {
                  const active = profile.areasOfLaw.includes(area)
                  return (
                    <button key={area} type="button" className={`${styles.chip} ${active ? styles.chipActive : ''}`} onClick={() => toggleArrayValue('areasOfLaw', area)}>
                      {active && <CheckCircle2 size={13} />} {area}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className={styles.chipBlock}>
              <h3>Services</h3>
              <div className={styles.chipGrid}>
                {SERVICE_OPTIONS.map((service) => {
                  const active = profile.services.includes(service)
                  return (
                    <button key={service} type="button" className={`${styles.chip} ${active ? styles.chipActive : ''}`} onClick={() => toggleArrayValue('services', service)}>
                      {active && <CheckCircle2 size={13} />} {service}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className={styles.chipBlock}>
              <h3>Languages</h3>
              <div className={styles.chipGrid}>
                {LANGUAGES.map((language) => {
                  const active = profile.languages.includes(language)
                  return (
                    <button key={language} type="button" className={`${styles.chip} ${active ? styles.chipActive : ''}`} onClick={() => toggleArrayValue('languages', language)}>
                      {active && <CheckCircle2 size={13} />} {language}
                    </button>
                  )
                })}
              </div>
            </div>
          </section>
        </div>

        <aside className={styles.previewColumn}>
          <section className={styles.publishPanel}>
            <div>
              <span className={styles.publishTitle}><Eye size={16} /> Directory visibility</span>
              <p>{profile.visible ? 'Visible to litigants after save.' : 'Hidden from the public directory.'}</p>
            </div>
            <button
              type="button"
              className={`${styles.switch} ${profile.visible ? styles.switchOn : ''}`}
              onClick={() => update('visible', !profile.visible)}
              aria-label="Toggle directory visibility"
            />
          </section>

          <section className={styles.previewPanel}>
            <div className={styles.previewMedia}>
              {profile.coverImageUrl ? (
                <img src={profile.coverImageUrl} alt="" />
              ) : (
                <div>
                  <span>{profile.type}</span>
                  <strong>{profile.areasOfLaw[0] || 'Legal support'}</strong>
                </div>
              )}
            </div>

            <div className={styles.previewBody}>
              <div className={styles.previewSeller}>
                <span className={styles.previewAvatar}>
                  {profile.profileImageUrl ? <img src={profile.profileImageUrl} alt="" /> : initials(profile.displayName)}
                </span>
                <div>
                  <strong>{profile.displayName || 'Your name'}</strong>
                  <small>{profile.businessName || profile.type}</small>
                </div>
              </div>

              <h3>{profile.headline || 'I will help litigants prepare their case clearly'}</h3>
              <div className={styles.previewStats}>
                <span><Star size={14} fill="currentColor" /> New</span>
                <span><Clock3 size={14} /> {profile.responseTime}</span>
              </div>
              <div className={styles.previewTags}>
                {profile.areasOfLaw.slice(0, 3).map((area) => <span key={area}>{area}</span>)}
              </div>
              <div className={styles.previewFooter}>
                <div>
                  <strong>{formatPrice(profile.startingPrice)}</strong>
                  {profile.offersVideoConsultations && <span><Video size={13} /> Offers video consultations</span>}
                </div>
              </div>
            </div>
          </section>

          <section className={styles.profileChecklist}>
            <h2>Publish checklist</h2>
            {['display name', 'listing title', 'contact email', 'city', 'at least one legal area'].map((item) => (
              <span key={item} className={!publishChecks.includes(item) ? styles.checkReady : ''}>
                <CheckCircle2 size={15} /> {item}
              </span>
            ))}
          </section>
        </aside>
      </div>
    </form>
  )
}
