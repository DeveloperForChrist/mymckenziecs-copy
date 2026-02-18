"use client"

type NoticeData = {
  title: string
  message: string
}

type NoticeModalProps = {
  notice: NoticeData | null
  onClose: () => void
}

export default function NoticeModal({ notice, onClose }: NoticeModalProps) {
  if (!notice) return null

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1200,
      padding: '20px'
    }}>
      <div style={{
        background: '#1a1a1a',
        borderRadius: '16px',
        padding: '24px',
        maxWidth: '420px',
        width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        <h3 style={{ margin: '0 0 8px', color: '#ffffff', fontSize: '20px', fontWeight: 700 }}>{notice.title}</h3>
        <p style={{ margin: '0 0 18px', color: 'rgba(255,255,255,0.82)', fontSize: '15px' }}>{notice.message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px',
              borderRadius: '8px',
              border: 'none',
              background: '#ffffff',
              color: '#1a1a1a',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
