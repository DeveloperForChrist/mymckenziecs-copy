'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, FolderOpen, Loader2, UploadCloud } from 'lucide-react'
import type { ClientMatter } from '@/lib/business/client-matters'
import { BUSINESS_OPEN_DOCUMENTS_EVENT } from '@/lib/events/business-events'
import styles from './clientMatters.module.css'

type MatterDocumentsPanelProps = {
  matter: ClientMatter
}

type ApiDocumentRow = {
  id: string
  name: string
  created_at: string
  file_size?: number | null
  mime_type?: string | null
}

function fmtSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  if (bytes > 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

function fmtDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

export default function MatterDocumentsPanel({ matter }: MatterDocumentsPanelProps) {
  const caseId = (matter.caseId || '').trim()
  const [rows, setRows] = useState<ApiDocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadDone, setUploadDone] = useState<string | null>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)

  const canLoad = Boolean(caseId)

  const load = async () => {
    if (!canLoad) {
      setRows([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/documents?limit=100&offset=0&caseId=${encodeURIComponent(caseId)}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Unable to load documents.')
      const next = Array.isArray(data?.documents) ? data.documents : []
      setRows(
        next.map((d: any) => ({
          id: String(d.id),
          name: String(d.name || 'Document'),
          created_at: String(d.created_at || new Date().toISOString()),
          file_size: typeof d.file_size === 'number' ? d.file_size : null,
          mime_type: typeof d.mime_type === 'string' ? d.mime_type : null,
        })),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load documents.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId])

  const headline = useMemo(() => {
    return matter.matterNumber ? `Matter ${matter.matterNumber}` : 'Matter documents'
  }, [matter.matterNumber])

  const openDocumentStorage = () => {
    if (!caseId) return
    window.dispatchEvent(
      new CustomEvent(BUSINESS_OPEN_DOCUMENTS_EVENT, {
        detail: {
          caseId,
          source: 'client-matters',
          matterId: matter.id,
          matterNumber: matter.matterNumber || null,
          clientName: matter.clientName || null,
        },
      }),
    )
  }

  const openDocument = async (docId: string) => {
    setError(null)
    try {
      const res = await fetch(`/api/documents/${docId}/signed`, { credentials: 'include', cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Unable to open document.')
      window.open(String(data.url), '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open document.')
    }
  }

  const onUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    if (!caseId) {
      setUploadError('This matter is still preparing its document workspace. Refresh and try again.')
      return
    }

    setUploading(true)
    setUploadError(null)
    setUploadDone(null)
    try {
      const formData = new FormData()
      formData.set('caseId', caseId)
      for (const file of Array.from(files)) {
        formData.append('files', file)
      }

      const res = await fetch('/api/documents', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Upload failed.')

      const uploadedCount = Array.isArray(data?.documents) ? data.documents.length : files.length
      setUploadDone(`${uploadedCount} document${uploadedCount === 1 ? '' : 's'} uploaded.`)
      if (uploadInputRef.current) uploadInputRef.current.value = ''
      await load()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={styles.matterDocs}>
      <div className={styles.matterDocsHeader}>
        <div>
          <h3 className={styles.matterDocsTitle}>Documents</h3>
          <p className={styles.matterDocsSubtitle}>{headline}</p>
        </div>
        <div className={styles.matterDocsActions}>
          <input
            ref={uploadInputRef}
            type="file"
            multiple
            className={styles.matterDocsFileInput}
            onChange={(e) => void onUpload(e.target.files)}
            aria-label="Upload documents to this matter"
          />
          <button
            type="button"
            className={styles.matterDocsUploadBtn}
            onClick={() => uploadInputRef.current?.click()}
            disabled={uploading || !canLoad}
            title={!canLoad ? 'Matter workspace is still preparing' : undefined}
          >
            {uploading ? <Loader2 size={16} className={styles.spin} /> : <UploadCloud size={16} />}
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
          <button
            type="button"
            className={styles.matterDocsManageBtn}
            onClick={openDocumentStorage}
            disabled={!canLoad}
            title={!canLoad ? 'Matter workspace is still preparing' : 'Open in Document Storage'}
          >
            <FolderOpen size={16} />
            Manage
          </button>
        </div>
      </div>

      {uploadError && <div className={styles.matterDocsNoticeError}>{uploadError}</div>}
      {uploadDone && <div className={styles.matterDocsNoticeSuccess}>{uploadDone}</div>}
      {error && <div className={styles.matterDocsNoticeError}>{error}</div>}

      <div className={styles.matterDocsBody}>
        {loading ? (
          <div className={styles.matterDocsEmpty}>
            <Loader2 size={18} className={styles.spin} />
            <p>Loading documents…</p>
          </div>
        ) : rows.length === 0 ? (
          <div className={styles.matterDocsEmpty}>
            <p>No documents uploaded yet.</p>
          </div>
        ) : (
          <div className={styles.matterDocsTable} role="table" aria-label="Matter documents">
            <div className={styles.matterDocsRowHead} role="row">
              <span role="columnheader">File</span>
              <span role="columnheader">Uploaded</span>
              <span role="columnheader">Size</span>
              <span role="columnheader" className={styles.matterDocsRowActionsHead}>
                Actions
              </span>
            </div>
            {rows.map((doc) => (
              <div key={doc.id} className={styles.matterDocsRow} role="row">
                <span role="cell" className={styles.matterDocsName} title={doc.name}>
                  {doc.name}
                </span>
                <span role="cell">{fmtDate(doc.created_at)}</span>
                <span role="cell">{fmtSize(Number(doc.file_size || 0))}</span>
                <span role="cell" className={styles.matterDocsRowActions}>
                  <button type="button" className={styles.matterDocsOpenBtn} onClick={() => void openDocument(doc.id)}>
                    <ExternalLink size={15} />
                    Open
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
